import { OISerial } from "./OISerial";
import { logger } from "../extension";

export class OIStepper extends OISerial {
    
    serialNum: string;
    paramList: string[] = [
        'abs-pos',
        'el-pos-microstep',
        'el-pos-step',
        'mark',
        'speed',
        'acc',
        'dec',
        'max-speed',
        'min-speed',
        'min-speed-lspd-opt',
        'adc-out',
        'ocd-th',
        'fs-spd',
        'fs-spd-boost-mode',
        'step-mode-step-sel',
        'step-mode-cm-vm',
        'step-mode-sync-sel',
        'step-mode-sync-en',
        'alarm-en-overcurrent',
        'alarm-en-thermal-shutdown',
        'alarm-en-thermal-warning',
        'alarm-en-uvlo',
        'alarm-en-adc-uvlo',
        'alarm-en-stall-detect',
        'alarm-en-sw-turn-on',
        'alarm-en-command-error',
        'gatecfg1-tcc',
        'gatecfg1-igate',
        'gatecfg1-tboost',
        'gatecfg1-wd-en',
        'gatecfg2-tdt',
        'gatecfg2-tblank',
        'config-osc-sel',
        'config-ext-clk',
        'config-sw-mode',
        'config-oc-sd',
        'config-uvloval',
        // voltage mode config
        'config-en-vscomp',
        'config-f-pwm-dec',
        'config-f-pwm-int',
        'kval-hold',
        'kval-run',
        'kval-acc',
        'kval-dec',
        'int-speed',
        'st-slp',
        'fn-slp-acc',
        'fn-slp-dec',
        'k-therm',
        'stall-th'
    ];

    constructor(portPath: string, serialNum?: string) {
        super(portPath);
        serialNum = serialNum;
    }

    static listStepper(): Promise<{port: string, serialNum: string}[]> {
        return new Promise(async (resolve) => {
            let stepperPorts: {port: string, serialNum: string}[] = [];
            let ports = await OISerial.list();
            // Loop through all available ports
            for await (let port of ports) {
                var serial = new OISerial(port.path);
                // Try to connect to the port
                await serial.connect().then(async () => {
                    // Try to connect module info
                    await serial.getInfo().then(async (moduleInfo) => {    
                        // Check if port is a stepper
                        if (moduleInfo.type === "11") {
                            stepperPorts.push({ port: port.path, serialNum: moduleInfo.serialNum });
                        }
                        // Try to get slaves and check if they are steppers modules
                        await serial.getSlaves().then((slaves) => {
                            for (let slave of slaves) {
                                if (slave.type === "11") {
                                    stepperPorts.push({ port: port.path, serialNum: slave.serialNum });
                                }
                            }
                        }).catch(() => { logger.info("Module is not a master module"); }); // If it is not a master module, it will be catched here and ignored
                    }).catch(async (error) => {
                        logger.error(error);
                        await serial.disconnect();
                        throw error;
                    });
                    await serial.disconnect();
                }).catch((error) => {
                    logger.error(error);
                });
            }
            logger.info(JSON.stringify(stepperPorts));
            resolve(stepperPorts);
        });
    }

    cmd(args: string[]): Promise<string> {
        return new Promise(async (resolve, reject) => {
            // Commands without return
            if ((args[0] === 'restart') ||
                (args[0] === 'homing') ||
                (args[0] === 'attach-limit-switch') ||
                (args[0] === 'set-speed') ||
                (args[0] === 'move-absolute') ||
                (args[0] === 'move-relative') ||
                (args[0] === 'run') ||
                (args[0] === 'stop') ||
                (args[0] === 'advanced-param' && args[2] === 'set') ||
                (args[0] === 'advanced-param' && args[2] === 'reset')) {
                await super.sendMsg(args.join(' ')).then(() => {
                    resolve("");
                }).catch(reject);
            }
            else if ((args[0] === 'get-position') ||
                     (args[0] === 'get-speed') ||
                     (args[0] === 'get-status') ||
                     (args[0] === 'read-status') ||
                     (args[0] === 'advanced-param' && args[2] === 'get')) {
                await super.sendMsgWithReturn(args.join(' ')).then((response) => {
                    resolve(response);
                }).catch(reject);
            }
            else {
                reject('Command not found');
            }
        });
    }

    getParam(motor: string): Promise<{[key: string]: string}[]> {
        return new Promise(async (resolve, reject) => {
            var advancedParamList: {[key: string]: string}[] = [];
            for await (let param of this.paramList) {
                await this.cmd(['advanced-param', motor, 'get', param]).then((response) => {
                    advancedParamList.push({param: response.toString()});
                }).catch(reject);
            }
            resolve(advancedParamList);
        });
    }

    setParam(motor: string, advancedParamList: {[key: string]: string}[]): Promise<void> {
        return new Promise(async (resolve, reject) => {
            for await (let param of advancedParamList) {
                await this.cmd(['advanced-param', motor, 'set', param.key, param.value]).catch(reject);
            }
            resolve();
        });
    }

    resetParam(motor: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            await this.cmd(['advanced-param', motor, 'reset']).then(() => { resolve(); }).catch(reject);
        });
    }
}