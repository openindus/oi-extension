import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import { formatStringOI, getFormattedDeviceList as getFormattedDeviceList, binAddress, pickDevice, ModuleInfo, getPlatformIOPythonPath, getEsptoolPath, nameToType } from './utils';
import * as fs from 'fs';
import { logger } from './extension';
import { OISerial } from './com/OISerial';

export async function flashSlaveDeviceFirmware(context: vscode.ExtensionContext, masterPortName: string, slavesModuleInfo: ModuleInfo[], version?: string) {

    // Choose the version
    // Get path to resource on disk
    let onDiskPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'bin');
    let firmwareVersionList = await vscode.workspace.fs.readDirectory(onDiskPath);
    let binVersions: vscode.QuickPickItem[] = [];
    firmwareVersionList.forEach((element) => {
        if (element[1] === vscode.FileType.Directory) {
            if (element[0].split('oi-firmware-')[1].length >= 5) { // 0.0.0 --> min length is 5
                binVersions.unshift({label: element[0].split('oi-firmware-')[1]});
            }
        }
    });

    if (version === undefined) {
        if (binVersions.length !== 1) {
            version = (await vscode.window.showQuickPick(binVersions, {
                placeHolder: "Select the version (choose the same version used for the main firmware)",
                ignoreFocusOut: true,
            }))?.label;
        } else {
            version = binVersions[0].label;
        }
    }
    onDiskPath = vscode.Uri.joinPath(onDiskPath, 'oi-firmware-' + version);

    var numberFlashedSuccessfully = 0;
    var flashErrorList: string[] = [];

    // Flash the Firmware
    let successFlash = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Flashing devices on Bus`,
        cancellable: true
    }, async (progress, cancellationToken) => {

        // Cycle through all slaves modules
        for await (const slaveModuleInfo of slavesModuleInfo) { 
            
            // Check if device type is known
            let deviceType: string = "";
            if (getFormattedDeviceList().includes(formatStringOI(slaveModuleInfo.type))) {
                deviceType = formatStringOI(slaveModuleInfo.type);
            } else {
                continue;
            }  

            // Show a message with current module info
            progress.report({message: `OI${deviceType} (SN:${slaveModuleInfo.serialNum}) - ${slavesModuleInfo.indexOf(slaveModuleInfo)+1}/${slavesModuleInfo.length}`});

            // Set the bin path and check it
            let firmware = vscode.Uri.joinPath(onDiskPath, deviceType.toLowerCase().replace('lite', '') + '_firmware-' + version + '.bin');
            if (fs.existsSync(firmware.fsPath) === false) { return; }

            try {
                var serial = new OISerial(masterPortName);
                await serial.connect();
                await serial.logLevel("NONE");
                await serial.program(nameToType(deviceType), slaveModuleInfo.serialNum);
                await serial.disconnect();
            }
            catch (error) {
                vscode.window.showErrorMessage(`Unexpected error while flashing device OI${deviceType} (SN:${slaveModuleInfo.serialNum}) !`);
                continue;
            }
            
            let successFlash = await new Promise( async (resolve) => {

                let options = {
                    mode: "text" as "text",
                    pythonPath: getPlatformIOPythonPath(),
                    args: [ '--port', masterPortName,
                            '--baud', '921600',
                            '--before', 'no_reset',
                            '--no-stub',
                            'write_flash',
                            '0x110000', firmware.fsPath
                    ] as string[]
                };

                let pyshell = new PythonShell(getEsptoolPath(), options);
                let lastIncrement = 0;

                pyshell.on('message', function (message) {
                    logger.info(message);
                    if (message.includes('%') && (message.includes("100 %") === false)) { // do not increment for 100% on bootloader, ota and partition
                        progress.report({
                            increment: (Number(message.split('(')[1].substring(0, 2)) - lastIncrement)/slavesModuleInfo.length,
                            message: `OI${deviceType} (SN:${slaveModuleInfo.serialNum}) - ${slavesModuleInfo.indexOf(slaveModuleInfo)+1}/${slavesModuleInfo.length}`
                        });
                        lastIncrement = Number(message.split('(')[1].substring(0, 2));
                    }
                });

                cancellationToken.onCancellationRequested(() => {
                    pyshell.kill();
                    resolve(false);
                });

                pyshell.end(function (err: any, code: any) {
                    if (code === 0) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
            });

            if (cancellationToken.isCancellationRequested) {
                break;
            }

            if (successFlash === false) {
                vscode.window.showErrorMessage(`Unexpected error while flashing device OI${deviceType} (SN:${slaveModuleInfo.serialNum}) !`);
                flashErrorList.push(`OI${deviceType} (SN:${slaveModuleInfo.serialNum})`);
                continue;
            } else {
                numberFlashedSuccessfully++;
            }

        };
    });

    // Prompt a success message or an error message
    if (flashErrorList.length > 0) {
        let message: string = "";
        message += `Error while flashing device${flashErrorList.length>0?"s":""}:\r\n`;
        for (const flashError of flashErrorList) {
            message += '- ';
            message += flashError;
            message += '\r\n';
        }
        vscode.window.showErrorMessage(message, {modal: true});
    } else if (numberFlashedSuccessfully === slavesModuleInfo.length) {
        vscode.window.showInformationMessage(`${slavesModuleInfo.length} device${slavesModuleInfo.length>1?"s":""} flashed successfully !`);
    }
}