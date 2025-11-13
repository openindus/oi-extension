import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';
import { logger } from '../extension';

/**
 * NodeTransport - adapter implementing the same API surface as esptool-js Transport
 * but backed by node-serialport for use in a VS Code extension (Node).
 *
 * Usage:
 *  const t = new NodeTransport('/dev/ttyUSB0', true, true);
 *  await t.connect(115200);
 *  await t.write(new Uint8Array([0x01,0x02]));
 *  for await (const pkt of t.read(2000)) { ... }
 */
export class NodeTransport {
    device: string;
    tracing: boolean;
    slipReaderEnabled: boolean;
    baudrate: number = 115200;

    private port?: SerialPort;
    private emitter = new EventEmitter();
    private buffer: Uint8Array = new Uint8Array(0);
    private traceLog: string[] = [];
    private lastTraceTime = Date.now();
    private dtrState = false;

    // SLIP constants
    private slipEnd = 0xC0;
    private slipEsc = 0xDB;
    private slipEscEnd = 0xDC;
    private slipEscEsc = 0xDD;

    constructor(devicePath: string, tracing = false, enableSlipReader = true) {
        this.device = devicePath;
        this.tracing = tracing;
        this.slipReaderEnabled = enableSlipReader;
    }

    // --- Info helpers ----------------------------------------------------
    async getInfo(): Promise<string> {
        try {
            const list = await SerialPort.list();
            const info = list.find(p => p.path === this.device);
                if (!info) { return this.device; }
            return `${info.vendorId ?? ''}:${info.productId ?? ''} (${this.device})`;
        } catch {
            return this.device;
        }
    }

    async getPid(): Promise<number | undefined> {
        try {
            const list = await SerialPort.list();
            const info = list.find(p => p.path === this.device);
            return info?.productId ? parseInt(info.productId, 16) : undefined;
        } catch {
            return undefined;
        }
    }

    // --- Tracing ---------------------------------------------------------
    trace(message: string): void {
        if (!this.tracing) { return; }
        const now = Date.now();
        const delta = now - this.lastTraceTime;
        this.lastTraceTime = now;
        const line = `[+${delta}ms] ${message}`;
        logger.info(line);
    }

    async returnTrace(): Promise<void> {
        // nothing to return anymore, traces are sent directly to logger
        return;
    }

    hexify(s: Uint8Array): string {
        return Array.from(s).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    hexConvert(uint8Array: Uint8Array, autoSplit = false): string {
        // similar to upstream helper
        const h = this.hexify(uint8Array);
    if (!autoSplit) { return h; }
        return h.match(/.{1,2}/g)?.join(' ') ?? h;
    }

    slipWriter(data: Uint8Array): Uint8Array {
        const out: number[] = [];
        out.push(this.slipEnd);
        for (const b of data) {
            if (b === this.slipEnd) {
                out.push(this.slipEsc, this.slipEscEnd);
            } else if (b === this.slipEsc) {
                out.push(this.slipEsc, this.slipEscEsc);
            } else {
                out.push(b);
            }
        }
        out.push(this.slipEnd);
        return new Uint8Array(out);
    }

    appendArray(arr1: Uint8Array, arr2: Uint8Array): Uint8Array {
        const res = new Uint8Array(arr1.length + arr2.length);
        res.set(arr1, 0);
        res.set(arr2, arr1.length);
        return res;
    }

    // --- Core IO --------------------------------------------------------
    async connect(baud = 115200): Promise<void> {
        this.baudrate = baud;
        if (this.port && this.port.isOpen) { return; }

        this.port = new SerialPort({
            path: this.device,
            baudRate: this.baudrate,
            autoOpen: false,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            rtscts: false,
            xon: false,
            xoff: false,
            hupcl: true,
            lock: false,
            // Add these parameters
            highWaterMark: 256
        });

        // Initialize port
        await new Promise<void>((resolve, reject) => {
            this.port!.open((err?: Error | null) => {
                if (err) {
                    this.trace('Serial port open error: ' + String(err));
                    reject(err);
                } else {
                    this.trace(`Connected ${this.device} @ ${this.baudrate}`);
                    resolve();
                }
            });
        });

        // Add initialization delay
        await new Promise(resolve => setTimeout(resolve, 100));

        // Clear any pending data
        await this.flushInput();
        await this.flushOutput();

        this.port.on('data', (chunk: Buffer) => {
            const u8 = new Uint8Array(chunk);
            this.pushToBuffer(u8);
            this.emitter.emit('data');
        });
    }

    private pushToBuffer(chunk: Uint8Array) {
        this.buffer = this.appendArray(this.buffer, chunk);
        if (this.tracing) { this.trace('RX: ' + this.hexConvert(chunk, true)); }
    }

    private popBytes(n: number): Uint8Array {
        const out = this.buffer.slice(0, n);
        this.buffer = this.buffer.slice(n);
        return out;
    }

    async write(data: Uint8Array): Promise<void> {
        const outData = this.slipWriter(data);
        if (!this.port || !this.port.isOpen) { throw new Error('Port not open'); }
        if (this.tracing) { this.trace('TX: ' + this.hexConvert(outData, true)); }
        await new Promise<void>((resolve, reject) => {
            // First flush any existing data
            this.port!.flush((flushErr) => {
                if (flushErr) { return reject(flushErr); }
                // Then write the new data
                this.port!.write(Buffer.from(outData), (writeErr?: Error | null) => {
                    if (writeErr) { return reject(writeErr); }
                    // Make sure data is actually sent
                    this.port!.drain((drainErr?: Error | null) => {
                        if (drainErr) { return reject(drainErr); }
                        resolve();
                    });
                });
            });
        });
    }

    async flushInput(): Promise<void> {
        if (!this.port) { return; }
        this.buffer = new Uint8Array(0);
        return new Promise<void>((resolve) => {
            // First drain any outgoing data
            this.port!.drain(() => {
                // Then flush incoming data
                this.port!.flush((err) => {
                    if (err) { logger.error(err); }
                    resolve();
                });
            });
        });
    }

    async flushOutput(): Promise<void> {
    if (!this.port) { return; }
        await new Promise<void>((resolve, reject) => {
            this.port!.drain((err?: Error | null) => err ? reject(err) : resolve());
        });
    }

    inWaiting(): number {
        return this.buffer.length;
    }

    // --- Panic detection (simple placeholder) ---------------------------
    private detectPanicHandler(_input: Uint8Array): void {
        // Implement platform specific panic detection if needed
    }

    // --- SLIP read generator -------------------------------------------
    async *read(timeout = 1000): AsyncGenerator<Uint8Array> {
        let partialPacket: Uint8Array | null = null;
        let isEscaping = false;
        let successfulSlip = false;

        while (this.port && this.port.isOpen) {
            const waitingBytes = this.inWaiting();
            const readBytes = await this.newRead(waitingBytes > 0 ? waitingBytes : 1, timeout);
            if (!readBytes || readBytes.length === 0) {
                const msg = partialPacket === null
                    ? successfulSlip
                        ? "Serial data stream stopped: Possible serial noise or corruption."
                        : "No serial data received."
                    : `Packet content transfer stopped`;
                this.trace(msg);
                throw new Error(msg);
            }
            this.trace(`Read ${readBytes.length} bytes: ${this.hexConvert(readBytes)}`);
            let i = 0; // Track position in readBytes
            while (i < readBytes.length) {
                const byte = readBytes[i++];
                if (partialPacket === null) {
                    if (byte === this.slipEnd) {
                        partialPacket = new Uint8Array(0); // Start of a new packet
                    }
                    else {
                        this.trace(`Read invalid data: ${this.hexConvert(readBytes)}`);
                        const remainingData = await this.newRead(this.inWaiting(), timeout);
                        this.trace(`Remaining data in serial buffer: ${this.hexConvert(remainingData)}`);
                        this.detectPanicHandler(new Uint8Array([...readBytes, ...(remainingData || [])]));
                        throw new Error(`Invalid head of packet (0x${byte.toString(16)}): Possible serial noise or corruption.`);
                    }
                }
                else if (isEscaping) {
                    isEscaping = false;
                    if (byte === this.slipEscEnd) {
                        partialPacket = this.appendArray(partialPacket, new Uint8Array([this.slipEnd]));
                    }
                    else if (byte === this.slipEscEsc) {
                        partialPacket = this.appendArray(partialPacket, new Uint8Array([this.slipEsc]));
                    }
                    else {
                        this.trace(`Read invalid data: ${this.hexConvert(readBytes)}`);
                        const remainingData = await this.newRead(this.inWaiting(), timeout);
                        this.trace(`Remaining data in serial buffer: ${this.hexConvert(remainingData)}`);
                        this.detectPanicHandler(new Uint8Array([...readBytes, ...(remainingData || [])]));
                        throw new Error(`Invalid SLIP escape (0xdb, 0x${byte.toString(16)})`);
                    }
                }
                else if (byte === this.slipEsc) {
                    isEscaping = true;
                }
                else if (byte === this.slipEnd) {
                    this.trace(`Received full packet: ${this.hexConvert(partialPacket)}`);
                    this.buffer = this.appendArray(this.buffer, readBytes.slice(i));
                    yield partialPacket;
                    partialPacket = null;
                    successfulSlip = true;
                }
                else {
                    partialPacket = this.appendArray(partialPacket, new Uint8Array([byte]));
                }
            }
        }
    }

    // --- rawRead generator ---------------------------------------------
    async *rawRead(): AsyncGenerator<Uint8Array> {
        while (this.port && this.port.isOpen) {
            if (this.buffer.length === 0) {
                // wait for data but avoid indefinite hang: wait up to 1000ms
                const arrived = await new Promise<boolean>(res => {
                    const onData = () => { this.emitter.off('data', onData); res(true); };
                    this.emitter.once('data', onData);
                    setTimeout(() => { this.emitter.off('data', onData); res(false); }, 1000);
                });
                if (!arrived) { continue; }
            }
            if (this.buffer.length > 0) {
                const chunk = this.popBytes(this.buffer.length);
                yield chunk;
            }
        }
    }

    // --- Control lines -------------------------------------------------
    async setRTS(state: boolean) {
        // Match WebSerial implementation for better compatibility
        // This matches the working pattern from webserial.js
        this.port?.set({ rts: state, dtr: this.dtrState }, (err) => {
            if (err) {
                logger.error(err);
            }
        });
    }
    
    async setDTR(state: boolean) {
        this.dtrState = state;
        this.port?.set({ dtr: state }, (err) => {
            if (err) {
                logger.error(err);
            }
        });
    }

    // --- Simple read helper -------------------------------------------
    async newRead(numBytes: number, timeout: number): Promise<Uint8Array> {
        const deadline = Date.now() + timeout;
        while (this.buffer.length < numBytes && Date.now() < deadline) {
            const remaining = Math.max(0, deadline - Date.now());
            const arrived = await new Promise<boolean>(res => {
                let timer: NodeJS.Timeout | undefined;
                const onData = () => {
                    if (timer) { clearTimeout(timer); }
                    this.emitter.off('data', onData);
                    res(true);
                };
                this.emitter.once('data', onData);
                timer = setTimeout(() => { this.emitter.off('data', onData); res(false); }, remaining);
            });
            if (!arrived) { break; } // timeout
        }
        const available = Math.min(numBytes, this.buffer.length);
        return this.popBytes(available);
    }

    async waitForUnlock(_timeout: number): Promise<void> {
        // Node side: nothing to unlock, keep as stub for compatibility
        return;
    }

    async resetToBootloader() {
        await this.setDTR(false);
        await this.setRTS(true);
        await new Promise((resolve) => setTimeout(resolve, 50));
        await this.setDTR(true);
        await this.setRTS(false);
    }

    async resetToMainApp() {
        await this.setDTR(true);
        await this.setRTS(true);
    }

    async disconnect(): Promise<void> {
    if (!this.port) { return; }
        try {
            await new Promise<void>((resolve, reject) => {
                this.port!.close((err?: Error | null) => err ? reject(err) : resolve());
            });
            this.trace(`Disconnected ${this.device}`);
        } finally {
            this.port = undefined;
            this.buffer = new Uint8Array(0);
        }
    }
}
