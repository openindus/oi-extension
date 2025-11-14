import { SerialPort, ReadlineParser, ReadyParser } from 'serialport';
import { logger } from '../extension';
import {Mutex} from 'async-mutex';

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OISerial extends SerialPort {

    private lineParser: ReadlineParser;
    private readyParser: ReadyParser | undefined;
    private lastResponse: string[] = [];
    private serialMutex: Mutex;

    constructor(portPath: string) {
        super({ path: portPath, baudRate: 115200, autoOpen: false });

        super.on('open', () => {
            logger.info("Connected !!");
            this.setDTR(true);
            this.setRTS(true);
            // Pipe the readyline parser only after a connection
            this.readyParser = super.pipe(new ReadyParser({ delimiter: '>' }));
                this.readyParser.on('ready', async () => {
                this.setDTR(false); // Important
                this.setRTS(false); // Important
                logger.info('The ready byte sequence has been received');
                // Unpipe it right after the detecttion of the console prompt
                super.unpipe(this.readyParser);
            });
        });

        super.on('close', () => {
            logger.info("disconnected");
        });

        this.serialMutex = new Mutex();        

        this.lineParser = super.pipe(new ReadlineParser({ delimiter: '\n' }));
        this.lineParser.on('data', (data: string) => {
            // Add data to the response list if it doesn't contain a color escape sequence
            if (!data.includes('\x1b[0;')) {
                this.lastResponse.push(
                    data.toString()
                    .replace("\r", "")
                    .replace("\n", "")
                    .replace(" ", ""));
            }
        });

        super.on('error', (err) => {
            logger.error("Error on serial port: " + err.message);
            this.lastResponse = [];
        });

        this.lineParser.on('error', (err) => {
            logger.error("Error on line parser: " + err.message);
            this.lastResponse = [];
        });

    }

    private setDTR(state: boolean): void {
        super.set({ dtr: state }, (err) => {
            if (err) {
                logger.error(err);
            }
        });
    }

    private setRTS(state: boolean): void {
        super.set({ rts: state }, (err) => {
            if (err) {
                logger.error(err);
            }
        });
    }

    private getPrompt(): Promise<string> {
        return new Promise(async (resolve, reject) => {

            // Wait for the board to be ready 50ms
            await sleep(50);
            
            // Send EOL to check if we have the prompt
            super.write("\n");
            super.drain();

            // Check if we've got the prompt with a timeout of 100ms
            const startTime = Date.now();
            while (!this.readyParser!.ready) {
                if (Date.now() - startTime > 100) { break; }
                await sleep(10);
            }

            // If prompt is ok; return
            if (this.readyParser!.ready) {
                resolve(">");
                return;
            }

            // Otherwise, reset the board to get the console
            this.setDTR(false); // Important
            this.setRTS(true); // Important
            await sleep(10);
            this.setDTR(true); // Important
            this.setRTS(false); // Important
            await sleep(10);
            this.setDTR(false); // Important
            this.setRTS(false); // Important
            await sleep(10);
            super.write("console\n"); // To activate console
            super.drain();

            // Check if we've got the prompt with a timeout of 2000ms
            const startTime2 = Date.now();
            while (!this.readyParser!.ready) {
                if (Date.now() - startTime2 > 2000) { reject("Prompt not available"); }
                await sleep(10);
            }

            resolve(">");
        });
    }

    connect(): Promise<boolean> {
        logger.info("Openning...");
        return new Promise((resolve, reject) => {
            if (super.isOpen) {
                resolve(true);
            }
            super.open((error) => {
                if (error) {
                    logger.error(error);
                    reject(error);
                } else {
                    this.getPrompt().then(() => {
                        resolve(true);
                    }).catch((error) => {
                        logger.error(error);
                        this.disconnect();
                        reject(error);   
                    });
                }
            });
        });
    }

    disconnect(): Promise<boolean> {
        logger.info("Disconnecting...");
        return new Promise((resolve, reject) => {
            if (!super.isOpen) {
                logger.info("Already closed !");
                resolve(true);
                return;
            }
            super.close((error) => {
                if (error) {
                    logger.error(error);
                    reject(error);
                } else {
                    resolve(true);
                }
            });
        }); 
    }

    protected async waitForResponse(timeout = 300): Promise<void> {
        const startTime = Date.now();
        while (this.lastResponse.length === 0) {
            if (Date.now() - startTime > timeout) {
                return;
            }
            await sleep(1);
        }
    }

    protected sendMsg(args: string, tryNumber = 0): Promise<void> {
        return new Promise(async (resolve, reject) => {
            await this.serialMutex.runExclusive(async () => {
                if (tryNumber > 5) {
                    reject("Failed to send message: too much unsuccessful attempts");
                    return;
                } else if (tryNumber > 3){
                    logger.warn("Trying to reconnect...");
                    await this.disconnect();
                    await this.connect().then(() => {
                        logger.info("Reconnected successfully");
                    }).catch((error) => {
                        reject("Failed to send message: cannot reconnect (" + error + ")");
                        return;
                    });
                    // Retry sending the message after reconnecting
                    this.serialMutex.cancel();
                    this.sendMsg(args, tryNumber + 1).then(resolve).catch(reject);
                } else if (!this.readyParser!.ready || !super.isOpen) {
                    reject("Failed to send message: disconnected or not ready");
                    return;
                } else {
                    logger.info("Sending message: " + args);
                    this.lastResponse = []; // Emptying response table
                    super.write(args + '\n'); // Send command
                    super.drain();
                    await this.waitForResponse();
                    let txt = this.lastResponse.shift();
                    while (txt !== undefined) {
                        if (txt.includes(args)) {
                            logger.info("Message sent");
                            resolve();
                            return;
                        }
                        // If received txt was not the expected one, try to read again
                        await this.waitForResponse();
                        txt = this.lastResponse.shift();
                    }
                    logger.warn("Failed to send message (" + tryNumber + "), retrying...");
                    this.serialMutex.cancel();
                    this.sendMsg(args, tryNumber + 1).then(resolve).catch(reject);
                }
            });
        });
    }

    protected sendMsgWithReturn(args: string, tryNumber = 0): Promise<string> {
        return new Promise(async (resolve, reject) => {
            await this.serialMutex.runExclusive(async () => {
                if (tryNumber > 5) {
                    reject("Failed to send message: too much unsuccessful attempts");
                    return;
                } else if (tryNumber > 3){
                    logger.warn("Trying to reconnect...");
                    await this.disconnect();
                    await this.connect().then(() => {
                        logger.info("Reconnected successfully");
                    }).catch((error) => {
                        reject("Failed to send message: cannot reconnect (" + error + ")");
                        return;
                    });
                    // Retry sending the message after reconnecting
                    this.serialMutex.cancel();
                    this.sendMsgWithReturn(args, tryNumber + 1).then(resolve).catch(reject);
                } else if (!this.readyParser!.ready || !super.isOpen) {
                    reject("Failed to send message: disconnected or not ready");
                    return;
                } else {
                    logger.info("Sending message: " + args);
                    this.lastResponse = []; // Emptying response table
                    super.write(args + '\n'); // Send command
                    super.drain();
                    await this.waitForResponse();
                    let txt = this.lastResponse.shift();
                    while (txt !== undefined) {
                        if (txt.includes(args)) {
                            logger.info("Message sent, reading response...");
                            // Trying to get response with a timeout of 2sec
                            txt = this.lastResponse.shift();
                            const startTime = Date.now();
                            while (txt === undefined) {
                                if (Date.now() - startTime > 2000) { break; }
                                await sleep(10);
                                txt = this.lastResponse.shift();
                            }
                            // If we've got a response, return it
                            if (txt !== undefined) {
                                logger.info("Response: " + txt);
                                resolve(txt);
                                return;
                            }
                        }
                        // If received txt was not the expected one, try to read again
                        await this.waitForResponse();
                        txt = this.lastResponse.shift();
                    }
                    logger.warn("Failed to send message (" + tryNumber + "), retrying...");
                    this.serialMutex.cancel();
                    this.sendMsgWithReturn(args, tryNumber + 1).then(resolve).catch(reject);
                }
            });
        });
    }

    async getInfo(): Promise<Record<string, string>> {
        logger.info("Getting device info");
        const deviceInfo: Record<string, string> = {
            type: "undefined",
            serialNum: "undefined",
            hardwareVar: "undefined",
            versionFw: "undefined"
        };
        await this.sendMsgWithReturn('get-board-info -t').then((response) => {
            deviceInfo["type"] = response;
        }).then(async () => {
            await this.sendMsgWithReturn('get-board-info -n').then((response) => {
                deviceInfo["serialNum"] = response;
            });
        }).then(async () => {
            await this.sendMsgWithReturn('get-board-info -h').then((response) => {
                deviceInfo["hardwareVar"] = response;
            });
        }).then(async () => {
            await this.sendMsgWithReturn('get-board-info -s').then((response) => {
                deviceInfo["versionFw"] = response;
            });
        }).catch(logger.error);
        return deviceInfo;
    }

    async getSlaves(): Promise<Record<string, string>[]> {
        logger.info("Getting slaves info");
        const slaveInfo: Record<string, string>[] = [];
        let slaveSNList: any[] = [];

        await this.sendMsgWithReturn('discover-slaves').then((response) => {
            slaveSNList = JSON.parse(response);
        }).catch((error) => { throw(error); });

        for (const slaveSn of slaveSNList) {
            const deviceInfo: Record<string, string> = {
                port: "undefined",
                type: "undefined",
                serialNum: "undefined",
                hardwareVar: "undefined",
                versionSw: "undefined",
                id: slaveSn.id.toString()
            };

            await this.sendMsgWithReturn(`get-slave-info ${slaveSn.type} ${slaveSn.sn} -t`).then((response) => {
                deviceInfo.type = response;
            }).catch(logger.error);
            await this.sendMsgWithReturn(`get-slave-info ${slaveSn.type} ${slaveSn.sn} -n`).then((response) => {
                deviceInfo.serialNum = response;
            }).catch(logger.error);
            await this.sendMsgWithReturn(`get-slave-info ${slaveSn.type} ${slaveSn.sn} -h`).then((response) => {
                deviceInfo.hardwareVar = response;
            }).catch(logger.error);
            await this.sendMsgWithReturn(`get-slave-info ${slaveSn.type} ${slaveSn.sn} -s`).then((response) => {
                deviceInfo.versionSw = response;
            }).catch(logger.error);

            slaveInfo.push(deviceInfo);
        }
        return slaveInfo;
    }

    async logLevel(level: string): Promise<void> {
        return this.sendMsg('log ' + level);
    }

    async program(type: string, num: string): Promise<void> {
        return this.sendMsg('program ' + type + ' ' + num);
    }
}