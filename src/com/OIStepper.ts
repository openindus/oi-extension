import { OISerial } from "./OISerial";
import { logger } from "../extension";

export class OIStepper extends OISerial {
    
    serialNum: string;
    id: number;
    onBus: boolean;

    paramList: string[] = [
        'acc',
        'dec',
        'max-speed',
        'min-speed',
        'min-speed-lspd-opt',
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
        'config-osc-sel',
        'config-ext-clk',
        'config-sw-mode',
        'config-oc-sd',
        'config-uvloval',
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

    statusList: string[] = [
        'hiz',
        'busy',
        'sw-level',
        'sw-turn-on',
        'direction',
        'motor-running',
        'motor-stopped',
        'cmd-error',
        'stck-mod',
        'uvlo',
        'uvlo-adc',
        'thermal-warning',
        'thermal-shutdown',
        'ocd',
        'stall-b',
        'stall-a',
    ];

    constructor(portPath: string, serialNum: string, id: string, onBus = false) {
        super(portPath);
        this.serialNum = serialNum;
        this.id = parseInt(id, 10);
        this.onBus = onBus;
    }

    static listStepper(): Promise<{port: string, serialNum: string}[]> {
        return new Promise(async (resolve) => {
            const stepperPorts: {port: string, serialNum: string, id:string, onBus: boolean}[] = [];
            const ports = await OISerial.list();
            // Loop through all available ports
            for await (const port of ports) {
                var serial = new OISerial(port.path);
                // Try to connect to the port
                await serial.connect().then(async () => {
                    // Try to connect module info
                    await serial.getInfo().then(async (moduleInfo) => {    
                        // Check if port is a stepper
                        if (moduleInfo.type === "11") {
                            stepperPorts.push({ port: port.path, serialNum: moduleInfo.serialNum, id: "0", onBus: false });
                        }
                        // Try to get slaves and check if they are steppers modules
                        await serial.getSlaves().then((slaves) => {
                            for (const slave of slaves) {
                                if (slave.type === "11") {
                                    stepperPorts.push({ port: port.path, serialNum: slave.serialNum, id: slave.id, onBus: true });
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
            if ((args[0] === 'stepper-restart') ||
                (args[0] === 'stepper-homing') ||
                (args[0] === 'stepper-attach-limit-switch') ||
                (args[0] === 'stepper-detach-limit-switch') ||
                (args[0] === 'stepper-set-speed') ||
                (args[0] === 'stepper-move-absolute') ||
                (args[0] === 'stepper-move-relative') ||
                (args[0] === 'stepper-run') ||
                (args[0] === 'stepper-stop') ||
                (args[0] === 'stepper-clear-status') ||
                (args[0] === 'stepper-advanced-param' && args[2] === 'set') ||
                (args[0] === 'stepper-advanced-param' && args[2] === 'reset')) {
                try {
                    let cmd = args.join(' ');
                    if (this.onBus) { cmd = cmd + ' -i ' + this.id; }
                    await super.sendMsg(cmd);
                    resolve("");
                } catch (error) {
                    reject(error);
                }
            }
            else if ((args[0] === 'stepper-get-position') ||
                     (args[0] === 'stepper-get-speed') ||
                     (args[0] === 'stepper-get-status') ||
                     (args[0] === 'stepper-advanced-param' && args[2] === 'get')) {
                try {
                    let cmd = args.join(' ');
                    if (this.onBus) { cmd = cmd + ' -i ' + this.id; }
                    const response = await super.sendMsgWithReturn(cmd);
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            }
            else {
                reject('Command not found');
            }
        });
    }

    getParam(motor: string): Promise<Record<string, string>> {
        return new Promise(async (resolve, reject) => {
            const advancedParamList: Record<string, string> = {};
            for (const param of this.paramList) {
                try {
                    const response = await this.cmd(['stepper-advanced-param', motor, 'get', param]);
                    advancedParamList[param] = response;
                } catch (err) {
                    reject(err);
                    return;
                }
            }
            resolve(advancedParamList);
        });
    }

    setParam(motor: string, advancedParamList: Record<string, string>): Promise<void> {
        return new Promise(async (resolve, reject) => {
            for (const param of this.paramList) {
                try {
                    if (advancedParamList[param] !== undefined) {
                        await this.cmd(['stepper-advanced-param', motor, 'set', param, advancedParamList[param]]);
                    }
                } catch (err) {
                    reject(err);
                    return;
                }
            }
            resolve();
        });
    }

    resetParam(motor: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            await this.cmd(['stepper-advanced-param', motor, 'reset']).then(() => { resolve(); }).catch(reject);
        });
    }

    getStatus(): Promise<Record<string, string>[]> {
        return new Promise(async (resolve, reject) => {
            const status: Record<string, string>[] = [{}, {}];
            try {
                const rawStatus1 = await this.cmd(['stepper-get-status', '1', '--raw']);
                const rawStatus2 = await this.cmd(['stepper-get-status', '2', '--raw']);
                const status1 = parseInt(rawStatus1, 16);
                const status2 = parseInt(rawStatus2, 16);
                for (const statusName of this.statusList) {
                    status[0][statusName] = (status1 & (1 << this.statusList.indexOf(statusName))) ? '1' : '0';
                    status[1][statusName] = (status2 & (1 << this.statusList.indexOf(statusName))) ? '1' : '0';
                }
                resolve(status);
            } catch (error) {
                logger.error("Error while getting status: " + error);
                reject(error);
            }
        });
    }
}