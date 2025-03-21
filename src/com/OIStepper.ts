import { OISerial } from "./OISerial";
import { logger } from "../extension";
import { error } from "console";

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

    constructor(portPath: string, serialNum: string) {
        super(portPath);
        serialNum = serialNum;
    }

    listStepper(): Promise<{port: string, serialNum: string}[]> {
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
                        if (moduleInfo.type?.toLowerCase().includes('stepper')) {
                            stepperPorts.push({ port: port.path, serialNum: moduleInfo.serialNum });
                        }
                        // Try to get slaves and check if they are steppers modules
                        await serial.getSlaves().then((slaves) => {
                            for (let slave of slaves) {
                                if (slave.type?.toLowerCase().includes('stepper')) {
                                    stepperPorts.push({ port: port.path, serialNum: slave.serialNum });
                                }
                            }
                        }).catch(logger.error); // If it is not a master module, it will be catched here and ignored
                    }).catch((error) => {
                        logger.error(error);
                        throw error;
                    });
                }).catch((error) => {
                    logger.error(error);
                });
            }
            resolve(stepperPorts);
        });
    }

    cmd(args: {name:string, value:string[]}): Promise<string> {
        return new Promise(async (resolve, reject) => {
            // Commands without return
            if ((args.name === 'resart') ||
                (args.name === 'homing') ||
                (args.name === 'attach-limit-switch') ||
                (args.name === 'set-speed') ||
                (args.name === 'move-absolute') ||
                (args.name === 'move-relative') ||
                (args.name === 'run') ||
                (args.name === 'stop') ||
                (args.name === 'advandec-param' && args.value[1] === 'set') ||
                (args.name === 'advandec-param' && args.value[1] === 'reset')) {
                await super.sendMsg(args.name + ' ' + args.value.join(' ')).then((response) => {
                    resolve(response);
                }).catch(reject);
            }
            else if ((args.name === 'get-position') ||
                     (args.name === 'get-speed') ||
                     (args.name === 'get-status') ||
                     (args.name === 'read-status') ||
                     (args.name === 'advandec-param' && args.value[1] === 'get')) {
                await super.sendMsgWithReturn(args.name + ' ' + args.value.join(' ')).then((response) => {
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
                await this.cmd({name: 'advanced-param', value: [motor, 'get', param]}).then((response) => {
                    advancedParamList.push({param: response});
                }).catch(reject);
            }
            resolve(advancedParamList);
        });
    }
}