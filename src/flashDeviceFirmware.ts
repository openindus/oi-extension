import * as vscode from 'vscode';
import * as fs from 'fs';

import { CustomReset, ESPLoader, FlashOptions, LoaderOptions, Transport } from 'esptool-js';

import { NodeTransport } from './com/NodeTransport';
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

    // Flash the Firmware
    let successFlash = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Flashing " + `OI${moduleInfo.type}` + " on " + `${moduleInfo.port}`,
        cancellable: true
    }, async (progress, cancellationToken) => {
        let successFlash = await new Promise( async (resolve) => {

            // let chip = 'esp32s3';
            // // Hack for old modules
            // if (moduleInfo.type === "stepperve") { chip = 'esp32s2'; }

            const transport = new NodeTransport(moduleInfo.port, true);

            const loaderOptions: LoaderOptions = {
                transport: transport as unknown as any,
                baudrate: 921600,
                romBaudrate: 115200
            };

            let lastWritten: number = 0;
            const flashOptions: FlashOptions = {
                fileArray: [{address: 0x0000, data: bootloader.fsPath},
                            {address: 0x8000, data: partitions.fsPath},
                            {address: 0xd000, data: otaDataInitial.fsPath},
                            {address: 0x10000, data: firmware.fsPath}],
                eraseAll: false,
                compress: true,
                flashSize: "8MB",
                reportProgress: (fileIndex, written, total) => {
                    if (fileIndex === 3) {
                        progress.report({increment: written/total-lastWritten});
                        lastWritten = written/total;
                    }
                },
            } as FlashOptions;

            let esploader = new ESPLoader(loaderOptions);
            await esploader.main();
            await esploader.writeFlash(flashOptions);

            // cancellationToken.onCancellationRequested(() => {
            //     pyshell.kill();
            //     resolve(false);
            // });

            // pyshell.end((err: PythonShellError, exitCode: number, exitSignal: string) => {
            //     if (exitCode === 0) {
            //         resolve(true);
            //     } else {
            //         resolve(false);
            //     }
            // });
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
