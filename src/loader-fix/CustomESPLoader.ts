import * as esptool from 'esptool-js';
import { ESPError } from 'esptool-js/lib/types/error.js';
import { ESP32S3ROM } from 'esptool-js/lib/targets/esp32s3.js';
import { LoaderOptions } from 'esptool-js';

import { getStubJsonByChipName } from './stubLoader';
import { NodeTransport } from './NodeTransport';
import { logger } from '../extension';

// Import the original ESPLoader class
const { ESPLoader } = esptool;

// Create a custom ESPLoader that uses our custom stub loader
export class CustomESPLoader extends ESPLoader {
    nodeTransport: NodeTransport;
    
    constructor(transport: NodeTransport) {
        const loaderOptions: LoaderOptions = {
            transport: transport as unknown as any,
            baudrate: 921600,
            romBaudrate: 115200,
            enableTracing: true
        };
        super(loaderOptions);
        this.nodeTransport = transport;
    }

    // Override the write method to log to VS Code terminal if available
    write(str, withNewline = true) {
        logger.info(str);
    }

    // Override the runStub method to use our custom stub loader
    async runStub(): Promise<esptool.ROM> {
        // Access the private property through the protected method
        // We can't directly access syncStubDetected, but we can use the same logic
        // as in the original code
        if (this.IS_STUB) {
            this.info("Stub is already running. No upload is necessary.");
            return this.chip;
        }
        
        this.info("Uploading stub...");
        
        // Use our custom stub loader instead of the original one
        const stubFlasher = getStubJsonByChipName(this.chip.CHIP_NAME);
        if (stubFlasher === undefined) {
            this.debug("Error loading Stub json");
            throw new Error("Error loading Stub json");
        }
        
        const stub = [stubFlasher.decodedText, stubFlasher.decodedData];
        for (let i = 0; i < stub.length; i++) {
            if (stub[i]) {
                const offs = i === 0 ? stubFlasher.text_start : stubFlasher.data_start;
                const length = stub[i].length;
                const blocks = Math.floor((length + this.ESP_RAM_BLOCK - 1) / this.ESP_RAM_BLOCK);
                await this.memBegin(length, blocks, this.ESP_RAM_BLOCK, offs);
                for (let seq = 0; seq < blocks; seq++) {
                    const fromOffs = seq * this.ESP_RAM_BLOCK;
                    const toOffs = fromOffs + this.ESP_RAM_BLOCK;
                    await this.memBlock(stub[i].slice(fromOffs, toOffs), seq);
                }
            }
        }
        
        this.info("Running stub...");
        await this.memFinish(stubFlasher.entry);
        const { value: packetResult } = await this.transport.read(this.DEFAULT_TIMEOUT).next();
        const packetStr = String.fromCharCode(...packetResult);
        if (packetStr !== "OHAI") {
            throw new ESPError(`Failed to start stub. Unexpected response ${packetStr}`);
        }
        this.info("Stub running...");
        this.IS_STUB = true;
        return this.chip;
    }


    async connectAndSync(resetToBootloader = true, noStub = false, attempts = 7, detecting = true) {
        let resp: string;
        await this.nodeTransport.connect();
        for (let i = 0; i < attempts; i++) {
            if (resetToBootloader) {
                await this.nodeTransport.resetToBootloader();
            }
            resp = await this._connectAttempt("no_reset", null);
            if (resp === "success") {
                break;
            }
        }
        if (resp !== "success") {
            throw new ESPError("Failed to connect with the device");
        }
        this.debug("Connect attempt successful.");
        this.info("\n\r", false);
        if (detecting) {
            const chipMagicValue = (await this.readReg(this.CHIP_DETECT_MAGIC_REG_ADDR)) >>> 0;
            this.debug("Chip Magic " + chipMagicValue.toString(16));
            if (chipMagicValue === 0x09) {
                this.chip = new ESP32S3ROM();
            }
            else {
                throw new ESPError(`Unexpected CHIP magic value ${chipMagicValue}. Failed to autodetect chip type.`);
            }
        }
        const chip = await this.chip.getChipDescription(this);
        this.info("Chip is " + chip);
        this.info("Features: " + (await this.chip.getChipFeatures(this)));
        this.info("Crystal is " + (await this.chip.getCrystalFreq(this)) + "MHz");
        this.info("MAC: " + (await this.chip.readMac(this)));
        if (typeof this.chip.postConnect !== "undefined") {
            await this.chip.postConnect(this);
        }
        if (!noStub) {
            await this.runStub();
        }
        await this.changeBaud();
    }
}
