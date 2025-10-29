import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';
import { logger } from '../extension';


function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    async connect(baud = 115200, _serialOptions?: any): Promise<void> {
        this.baudrate = baud;
    if (this.port && this.port.isOpen) { return; }

        this.port = new SerialPort({
            path: this.device,
            baudRate: this.baudrate,
            autoOpen: false
        });

        this.port.on('data', (chunk: Buffer) => {
            const u8 = new Uint8Array(chunk);
            this.pushToBuffer(u8);
            this.emitter.emit('data'); // notify readers
        });

        this.port.on('error', (err) => {
            this.emitter.emit('error', err);
            this.trace('SerialPort error: ' + String(err));
        });

        await new Promise<void>((resolve, reject) => {
            this.port!.open((err?: Error | null) => err ? reject(err) : resolve());
        });
        this.trace(`Connected ${this.device} @ ${this.baudrate}`);
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
        if (!this.port || !this.port.isOpen) { throw new Error('Port not open'); }
        if (this.tracing) { this.trace('TX: ' + this.hexConvert(data, true)); }
        await new Promise<void>((resolve, reject) => {
            this.port!.write(Buffer.from(data), (err?: Error | null) => {
                if (err) { return reject(err); }
                this.port!.drain((drainErr?: Error | null) => {
                    if (drainErr) { return reject(drainErr); }
                    resolve();
                });
            });
        });
    }

    async flushInput(): Promise<void> {
    if (!this.port) { return; }
        this.buffer = new Uint8Array(0);
        await new Promise<void>((resolve, reject) => {
            this.port!.flush((err?: Error | null) => err ? reject(err) : resolve());
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
        // Wait for data or timeout, returning true if data arrived, false on timeout
        const waitForDataOrTimeout = (ms: number) => new Promise<boolean>(res => {
            let timer: NodeJS.Timeout | undefined;
            const onData = () => {
                if (timer) { clearTimeout(timer); }
                this.emitter.off('data', onData);
                res(true);
            };
            this.emitter.once('data', onData);
            timer = setTimeout(() => {
                this.emitter.off('data', onData);
                res(false);
            }, ms);
        });

        while (this.port && this.port.isOpen) {
            // If buffer contains a SLIP_END already we can proceed immediately
            let endIdx = this.buffer.indexOf(this.slipEnd);
            if (endIdx === -1) {
                // wait for either data or timeout
                const arrived = await waitForDataOrTimeout(timeout);
                if (!arrived) {
                    // timeout elapsed and still no SLIP_END -> return to caller (stop generator)
                    return;
                }
                // Data arrived; check again for SLIP_END
                endIdx = this.buffer.indexOf(this.slipEnd);
                if (endIdx === -1) {
                    // Data arrived but no SLIP_END found; continue loop and wait again
                    continue;
                }
            }

            // extract up to endIdx (may be 0-length packet)
            const packetRaw = this.popBytes(endIdx + 1); // includes END
            // remove leading/trailing ENDs and unescape
            const payload = this.decodeSlip(packetRaw);
            if (payload.length > 0) {
                this.detectPanicHandler(payload);
                yield payload;
            }
        }
    }

    private decodeSlip(packetWithEnd: Uint8Array): Uint8Array {
        // packetWithEnd contains bytes up to and including a SLIP_END;
        // remove starting/ending SLIP_END bytes (some send leading ENDs)
        let inner = packetWithEnd;
    // strip all leading ENDs
    let start = 0;
    while (start < inner.length && inner[start] === this.slipEnd) { start++; }
    // strip trailing ENDs
    let end = inner.length - 1;
    while (end >= start && inner[end] === this.slipEnd) { end--; }
    if (end < start) { return new Uint8Array(0); }
        const raw = inner.slice(start, end + 1);

        const out: number[] = [];
        for (let i = 0; i < raw.length; i++) {
            const b = raw[i];
            if (b === this.slipEsc) {
                const next = raw[++i];
                if (next === this.slipEscEnd) { out.push(this.slipEnd); }
                else if (next === this.slipEscEsc) { out.push(this.slipEsc); }
                // else ignore malformed
            } else {
                out.push(b);
            }
        }
        return new Uint8Array(out);
    }

    // --- rawRead generator ---------------------------------------------
    async *rawRead(): AsyncGenerator<Uint8Array> {
        while (this.port && this.port.isOpen) {
            if (this.buffer.length === 0) {
                // wait for data but avoid indefinite hang: wait up to 1000ms
                const arrived = await new Promise<boolean>(res => {
                    const onData = () => { this.emitter.off('data', onData); res(true); };
                    this.emitter.once('data', onData);
                    const t = setTimeout(() => { this.emitter.off('data', onData); res(false); }, 1000);
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
        this.port.set({rts: true, dtr: false});
        await sleep(100);
        this.port.set({rts: false, dtr: true});
        await sleep(100);
        this.port.set({rts: true, dtr: false});
        await sleep(100);
        
        // this.port.set({ rts: state }, (err) => {
        //     if (err) {
        //         logger.error(err);
        //     } else {
        //         // logger.info("rts:"+state);
        //     }
        // });
    }

    async setDTR(state: boolean) {
        this.port.set({ dtr: state }, (err) => {
            if (err) {
                logger.error(err);
            } else {
                // logger.info("dtr:"+state);
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

    // --- Utilities -----------------------------------------------------
    async sleep(ms: number): Promise<unknown> {
        return new Promise(res => setTimeout(res, ms));
    }

    async waitForUnlock(_timeout: number): Promise<void> {
        // Node side: nothing to unlock, keep as stub for compatibility
        return;
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