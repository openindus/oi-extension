import { SerialPort, ReadlineParser, ReadyParser } from 'serialport';
import { setTimeout } from 'timers-promises';

export class OISerial extends SerialPort {
    private lineParser: ReadlineParser;
    private readyParser: ReadyParser;
    private lastResponse: string[] = [];

    constructor(portPath: string) {
        super({ path: portPath, baudRate: 115200, autoOpen: false });

        super.on('open', (err: Error | null | undefined) => {
            console.log("Connected !!");
            this.setDTR(true);
            this.setRTS(true);
        });

        super.on('close', (err) => {
            console.log("disconnected");
        });

        this.readyParser = super.pipe(new ReadyParser({ delimiter: '>' }));
        this.readyParser.on('ready', async () => {
            this.setDTR(false); // Important
            this.setRTS(false); // Important
            console.log('The ready byte sequence has been received');
        });

        this.lineParser = super.pipe(new ReadlineParser({ delimiter: '\n' }));
        this.lineParser.on('data', (data) => {
            console.log(data.toString());
            this.lastResponse.push(data.toString());
        });
    }

    private setDTR(state: boolean): void {
        super.set({ dtr: state }, (err) => {
            if (err) {
                console.log(err);
            }
        });
    }

    private setRTS(state: boolean): void {
        super.set({ rts: state }, (err) => {
            if (err) {
                console.log(err);
            }
        });
    }

    private getPrompt(): Promise<string> {
        return new Promise(async (resolve, reject) => {
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

    connect(): Promise<string> {
        return new Promise((resolve, reject) => {
            super.open((error) => {
                if (error) {
                    console.log(error.toString());
                    reject(error);
                } else {
                    this.getPrompt().then((response) => {
                        resolve(response);
                    }).catch((error) => {
                        console.log(error);
                        reject(error);
                    });
                }
            });
        });
    }

    disconnect(): void {
        super.close();
    }

    private sendMsg(args: string, tryNumber = 0): Promise<string> {
        return new Promise(async (resolve, reject) => {
            if (tryNumber > 10 || !this.readyParser.ready) {
                reject("Failed to send message");
            } else {
                console.log("Sending message: " + args);
                this.lastResponse = []; // Emptying response table
                super.write(args + '\n'); // Send command
                super.drain();
                await setTimeout(10); // Wait for echo to be read
                let txt = this.lastResponse.shift();
                while (txt != undefined) {
                    if (txt.includes(args)) {
                        console.log("Message sent");
                        resolve("Message sent");
                        return;
                    }
                    txt = this.lastResponse.shift();
                }
                console.log("Failed to send message, retrying...");
                this.sendMsg(args, tryNumber + 1).catch(reject);
            }
        });
    }

    private sendMsgWithReturn(args: string, tryNumber = 0): Promise<string> {
        return new Promise(async (resolve, reject) => {
            if (tryNumber > 10 || !this.readyParser.ready) {
                reject("Failed to send message");
            } else {
                console.log("Sending message: " + args);
                super.write(args + '\n');
                super.drain();
                await setTimeout(10); // Wait for echo to be read
                let txt = this.lastResponse.shift();
                while (txt !== undefined) {
                    if (txt.includes(args)) {
                        console.log("Message sent, reading response...");
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
                            console.log("Response: " + txt);
                            txt = txt.replace("\r", "");
                            txt = txt.replace("\n", "");
                            txt = txt.replace(" ", "");
                            resolve(txt);
                            return;
                        }
                    }
                    txt = this.lastResponse.shift();
                }
                console.log("Failed to send message, retrying...");
                this.sendMsgWithReturn(args, tryNumber + 1).catch(reject);
            }
        });
    }

    async getInfo(): Promise<{ [key: string]: string }> {
        const deviceInfo: { [key: string]: string } = {
            type: "undefined",
            serialNum: "undefined",
            hardwareVar: "undefined",
            versionFw: "undefined"
        };
        await this.sendMsgWithReturn('get-board-info -t').then((response) => {
            deviceInfo["type"] = response;
        }).catch(console.log);
        await this.sendMsgWithReturn('get-board-info -n').then((response) => {
            deviceInfo["serialNum"] = response;
        }).catch(console.log);
        await this.sendMsgWithReturn('get-board-info -h').then((response) => {
            deviceInfo["hardwareVar"] = response;
        }).catch(console.log);
        await this.sendMsgWithReturn('get-board-info -s').then((response) => {
            deviceInfo["versionFw"] = response;
        }).catch(console.log);
        return deviceInfo;
    }

    async getSlaves(): Promise<{ [key: string]: string }[]> {
        const slaveInfo: { [key: string]: string }[] = [];
        let slaveSNList: any[] = [];

        await this.sendMsgWithReturn('discover-slaves').then((response) => {
            slaveSNList = JSON.parse(response);
        }).catch(console.log);

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
            }).catch(console.log);
            await this.sendMsgWithReturn(`get-slave-info ${slaveSn.type} ${slaveSn.sn} -n`).then((response) => {
                deviceInfo.serialNum = response;
            }).catch(console.log);
            await this.sendMsgWithReturn(`get-slave-info ${slaveSn.type} ${slaveSn.sn} -h`).then((response) => {
                deviceInfo.hardwareVar = response;
            }).catch(console.log);
            await this.sendMsgWithReturn(`get-slave-info ${slaveSn.type} ${slaveSn.sn} -s`).then((response) => {
                deviceInfo.versionSw = response;
            }).catch(console.log);

            slaveInfo.push(deviceInfo);
        }
        return slaveInfo;
    }
}