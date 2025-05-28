import { SerialPort, ReadlineParser, ReadyParser } from 'serialport';
import { setTimeout } from 'timers-promises';
import { logger } from '../extension';

export class OISerial extends SerialPort {

    private lineParser: ReadlineParser;
    private readyParser: ReadyParser;
    private lastResponse: string[] = [];

    constructor(portPath: string) {
        super({ path: portPath, baudRate: 115200, autoOpen: false });

        super.on('open', () => {
            logger.info("Connected !!");
            this.setDTR(true);
            this.setRTS(true);
        });

        super.on('close', () => {
            logger.info("disconnected");
        });

        this.readyParser = super.pipe(new ReadyParser({ delimiter: '>' }));
        this.readyParser.on('ready', async () => {
            this.setDTR(false); // Important
            this.setRTS(false); // Important
            logger.info('The ready byte sequence has been received');
        });

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
            await setTimeout(50);
            
            // Send EOL to check if we have the prompt
            super.write("\n");
            super.drain();

            // Check if we've got the prompt with a timeout of 100ms
            const startTime = Date.now();
            while (!this.readyParser.ready) {
                if (Date.now() - startTime > 100) { break; }
                await setTimeout(10);
            }

            // If prompt is ok; return
            if (this.readyParser.ready) {
                resolve(">");
                return;
            }

            // Otherwise, reset the board to get the console
            this.setDTR(false); // Important
            await setTimeout(10);
            this.setDTR(true); // Important
            await setTimeout(10);
            this.setDTR(false); // Important
            this.setRTS(false); // Important
            await setTimeout(10);
            super.write("console\n"); // To activate console
            super.drain();

            // Check if we've got the prompt with a timeout of 2000ms
            const startTime2 = Date.now();
            while (!this.readyParser.ready) {
                if (Date.now() - startTime2 > 2000) { reject("Prompt not available"); }
                await setTimeout(10);
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

    protected sendMsg(args: string, tryNumber = 0): Promise<void> {
        return new Promise(async (resolve, reject) => {
            if (tryNumber > 10 || !this.readyParser.ready) {
                reject("Failed to send message");
            } else {
                logger.info("Sending message: " + args);
                this.lastResponse = []; // Emptying response table
                super.write(args + '\n'); // Send command
                super.drain();
                await setTimeout(50); // Wait for echo to be read
                let txt = this.lastResponse.shift();
                while (txt !== undefined) {
                    if (txt.includes(args)) {
                        logger.info("Message sent");
                        resolve();
                        return;
                    }
                    txt = this.lastResponse.shift();
                }
                logger.warn("Failed to send message (" + tryNumber + "), retrying...");
                this.sendMsg(args, tryNumber + 1).then(resolve).catch(reject);
            }
        });
    }

    protected sendMsgWithReturn(args: string, tryNumber = 0): Promise<string> {
        return new Promise(async (resolve, reject) => {
            if (tryNumber > 10 || !this.readyParser.ready) {
                reject("Failed to send message");
            } else {
                logger.info("Sending message: " + args);
                super.write(args + '\n');
                super.drain();
                await setTimeout(50); // Wait for echo to be read
                let txt = this.lastResponse.shift();
                while (txt !== undefined) {
                    if (txt.includes(args)) {
                        logger.info("Message sent, reading response...");
                        // Trying to get response with a timeout of 2sec
                        txt = this.lastResponse.shift();
                        const startTime = Date.now();
                        while (txt === undefined) {
                            if (Date.now() - startTime > 2000) { break; }
                            await setTimeout(10);
                            txt = this.lastResponse.shift();
                        }
                        // If we've got a response, return it
                        if (txt !== undefined) {
                            logger.info("Response: " + txt);
                            resolve(txt);
                            return;
                        }
                    }
                    txt = this.lastResponse.shift();
                }
                logger.warn("Failed to send message (" + tryNumber + "), retrying...");
                this.sendMsgWithReturn(args, tryNumber + 1).then(resolve).catch(reject);
            }
        });
    }

    async getInfo(): Promise<{ [key: string]: string }> {
        logger.info("Getting device info");
        const deviceInfo: { [key: string]: string } = {
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

    async getSlaves(): Promise<{ [key: string]: string }[]> {
        logger.info("Getting slaves info");
        const slaveInfo: { [key: string]: string }[] = [];
        let slaveSNList: any[] = [];

        await this.sendMsgWithReturn('discover-slaves').then((response) => {
            slaveSNList = JSON.parse(response);
        }).catch((error) => { throw(error); });

        for (const slaveSn of slaveSNList) {
            const deviceInfo: { [key: string]: string } = {
                port: "undefined",
                type: "undefined",
                serialNum: "undefined",
                hardwareVar: "undefined",
                versionSw: "undefined"
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