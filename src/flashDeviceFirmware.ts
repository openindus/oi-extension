import * as vscode from 'vscode';
import * as fs from 'fs';
import * as CryptoJS from 'crypto-js';

import { FlashOptions, LoaderOptions } from 'esptool-js';
import { CustomESPLoader } from './esptool-js-fix/CustomESPLoader';
import { NodeTransport } from './esptool-js-fix/NodeTransport';
import { deviceTypeList, pickDevice, ModuleInfo } from './utils';
import { logger } from './extension';

export async function flashDeviceFirmware(context: vscode.ExtensionContext, portName?: string, inputModuleInfo?: ModuleInfo) {

    let moduleInfo: ModuleInfo | undefined;

    // if device type and port are given; do not check again
    if (inputModuleInfo === undefined) {
        // Choose the device
        moduleInfo = await pickDevice(context, portName);
    } else {
        moduleInfo = inputModuleInfo; // use given module info
    }

    if (moduleInfo === undefined) { return; }
    if (moduleInfo.port === undefined) { return; }

    // Check if device type is known
    if (!deviceTypeList.includes(moduleInfo.type)) {
        // TODO: if device type could be read by console, check with espefuse.py --> if firmware is wrong, it could still detect the right device name
        // else ask the user
        let deviceSelected = await vscode.window.showQuickPick(deviceTypeList, { placeHolder: 'Choose the device type', ignoreFocusOut: true});
        if (deviceSelected !== undefined) {
            moduleInfo.type = deviceSelected;
        } else {
            return;
        }
    }

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

    let version = await vscode.window.showQuickPick(binVersions, {
        placeHolder: "Select the version (choose the same version used for the main firmware)",
        ignoreFocusOut: true,
    });

    // Set the bin path and check it
    // Remove 'lite' in OICoreLite because there is no special firmware for this board
    onDiskPath = vscode.Uri.joinPath(onDiskPath, 'oi-firmware-' + version?.label);
    let bootloader = vscode.Uri.joinPath(onDiskPath, moduleInfo.type.replace("lite", "") + '_bootloader-' + version?.label + '.bin');
    let partitions = vscode.Uri.joinPath(onDiskPath, moduleInfo.type.replace("lite", "") + '_partitions-' + version?.label + '.bin');
    let otaDataInitial = vscode.Uri.joinPath(onDiskPath, moduleInfo.type.replace("lite", "") + '_ota_data_initial-' + version?.label + '.bin');
    let firmware = vscode.Uri.joinPath(onDiskPath, moduleInfo.type.replace("lite", "") + '_firmware-' + version?.label + '.bin');
    
    logger.info(bootloader.toString());
    logger.info(partitions.toString());
    logger.info(otaDataInitial.toString());
    logger.info(firmware.toString());

    if (fs.existsSync(bootloader.fsPath) === false) { return; }
    if (fs.existsSync(partitions.fsPath) === false) { return; }
    if (fs.existsSync(otaDataInitial.fsPath) === false) { return; }
    if (fs.existsSync(firmware.fsPath) === false) { return; }

    const bootloaderData: string = fs.readFileSync(bootloader.fsPath).toString('binary');
    const partitionsData: string = fs.readFileSync(partitions.fsPath).toString('binary');
    const otaDataInitialData: string = fs.readFileSync(otaDataInitial.fsPath).toString('binary');
    const firmwareData: string = fs.readFileSync(firmware.fsPath).toString('binary');

    // Flash the Firmware
    let successFlash = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Flashing " + `OI${moduleInfo.type}` + " on " + `${moduleInfo.port}`,
        cancellable: true
    }, async (progress, cancellationToken) => {
        let successFlash = await new Promise( async (resolve) => {

            try {
                const transport = new NodeTransport(moduleInfo.port);

                const loaderOptions: LoaderOptions = {
                    transport: transport as unknown as any,
                    baudrate: 921600,
                    romBaudrate: 115200
                };

                let lastWritten: number = 0;
                const flashOptions: FlashOptions = {
                    fileArray: [{address: 0x0000, data: bootloaderData},
                                {address: 0x8000, data: partitionsData},
                                {address: 0xd000, data: otaDataInitialData},
                                {address: 0x10000, data: firmwareData}],
                    eraseAll: true,
                    compress: true,
                    flashSize: "8MB",
                    flashMode: "qio",
                    flashFreq: "80m",
                    reportProgress: (fileIndex, written, total) => {
                        if (fileIndex === 3) {
                            progress.report({increment: (written/total)*100-lastWritten});
                            lastWritten = (written/total)*100;
                        }
                    },
                    calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)),
                } as FlashOptions;

                // let esploader = new CustomESPLoader(loaderOptions);
                let esploader = new CustomESPLoader(loaderOptions);
                await esploader.main();
                await esploader.writeFlash(flashOptions);
                await esploader.after();
                await new Promise((resolve) => setTimeout(resolve, 100));
                await transport.disconnect();
                resolve(true);
            } 
            catch (error) {
                logger.error(error);
                resolve(false);
            }

        });
        return successFlash;
    });
        
    // Prompt a success message or an error message
    if (successFlash === true) {
        vscode.window.showInformationMessage(`Device ${moduleInfo.type}  on ${moduleInfo.port} flashed successfully !`);
    } else {
        vscode.window.showErrorMessage("Unexpected error while flashing device !");
    }
}
