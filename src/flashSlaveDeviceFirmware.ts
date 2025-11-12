import * as vscode from 'vscode';
import * as fs from 'fs';
import * as CryptoJS from 'crypto-js';

import { ModuleInfo, nameToType, deviceTypeList, getSimpleName } from './utils';
import { NodeTransport, ESPLoader, LoaderOptions, CustomReset, FlashOptions } from './esptool-js/index';
import { logger } from './extension';
import { OISerial } from './com/OISerial';

export async function flashSlaveDeviceFirmware(context: vscode.ExtensionContext, masterPortName: string, slavesModuleInfo: ModuleInfo[], version?: string) {

    // Choose the version
    // Get path to resource on disk
    let onDiskPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'binaries');
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
            if (!deviceTypeList.map(getSimpleName).includes(slaveModuleInfo.type)) {
                continue;
            }  

            // Show a message with current module info
            progress.report({message: `OI${slaveModuleInfo.type} (SN:${slaveModuleInfo.serialNum}) - ${slavesModuleInfo.indexOf(slaveModuleInfo)+1}/${slavesModuleInfo.length}`});

            // Set the bin path and check it
            let firmware = vscode.Uri.joinPath(onDiskPath, slaveModuleInfo.type.replace('lite', '') + '_firmware-' + version + '.bin');
            if (fs.existsSync(firmware.fsPath) === false) { 
                vscode.window.showErrorMessage(`Firmware file not found: ${firmware.fsPath}`);
                flashErrorList.push(`OI${slaveModuleInfo.type} (SN:${slaveModuleInfo.serialNum}) - Firmware file not found`);
                continue;
            }

            try {
                // First, use OISerial to program the device (this handles the initial communication)
                var serial = new OISerial(masterPortName);
                await serial.connect();
                await serial.logLevel("NONE");
                await serial.program(nameToType(slaveModuleInfo.type), slaveModuleInfo.serialNum);
                await serial.disconnect();
            }
            catch (error) {
                vscode.window.showErrorMessage(`Unexpected error while establishing communication with device OI${slaveModuleInfo.type} (SN:${slaveModuleInfo.serialNum}) !`);
                flashErrorList.push(`OI${slaveModuleInfo.type} (SN:${slaveModuleInfo.serialNum}) - Communication error`);
                continue;
            }
            
            const transport = new NodeTransport(masterPortName);
            const loaderOptions: LoaderOptions = {
                transport: transport,
                baudrate: 921600,
                romBaudrate: 115200,
                debugLogging: false,
                enableTracing: false,
                noStub: true
            };
            const esploader = new ESPLoader(loaderOptions);

            // Now use CustomESPLoader to flash the firmware
            let successFlash = await new Promise<boolean>(async (resolve) => {
                let result = true;
                try {

                    const firmwareData = fs.readFileSync(firmware.fsPath).toString('binary');

                    const flashOptions: FlashOptions = {
                        fileArray: [
                            { address: 0x110000, data: firmwareData }
                        ],
                        eraseAll: false,
                        compress: false,
                        flashSize: "8MB",
                        flashMode: "qio",
                        flashFreq: "80m",
                        reportProgress: (fileIndex, written, total) => {
                            // Report progress for the firmware file
                            if (total > 0) {
                                const progressPercent = (written / total) * 100;
                                progress.report({
                                    increment: progressPercent / slavesModuleInfo.length - lastProgressWritten,
                                    message: `OI${slaveModuleInfo.type} (SN:${slaveModuleInfo.serialNum}) - ${slavesModuleInfo.indexOf(slaveModuleInfo)+1}/${slavesModuleInfo.length}`
                                });
                                lastProgressWritten = progressPercent / slavesModuleInfo.length;
                            }
                        },
                        calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image))
                    };

                    let lastProgressWritten = 0;

                    await esploader.main("no_reset"); // Do not reset and don't use stub
                    await esploader.writeFlash(flashOptions);
                    await new Promise(resolve => setTimeout(resolve, 100));
                    result = true;
                } 
                catch (error) {
                    logger.error('Error during flashing process:', error);
                    result = false;
                }
                finally {
                    await transport.resetToMainApp();
                    await new Promise(resolve => setTimeout(resolve, 200));
                    await transport.disconnect();
                    resolve(result);
                }
            });

            if (cancellationToken.isCancellationRequested) {
                break;
            }

            if (successFlash === false) {
                vscode.window.showErrorMessage(`Unexpected error while flashing device OI${slaveModuleInfo.type} (SN:${slaveModuleInfo.serialNum}) !`);
                flashErrorList.push(`OI${slaveModuleInfo.type} (SN:${slaveModuleInfo.serialNum})`);
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
