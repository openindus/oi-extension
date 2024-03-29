import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import { deviceTypeList, formatStringOI, getFormatedDeviceList, binAddress, pickDevice, ModuleInfo } from './utils';
import * as fs from 'fs';
const pioNodeHelpers = require('platformio-node-helpers');

export async function flashDeviceFirmware(context: vscode.ExtensionContext, portName?: string, inputModuleInfo?: ModuleInfo) {

    let moduleInfo: ModuleInfo | undefined = undefined;
    let deviceType: string = "";

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
    if (getFormatedDeviceList().includes(formatStringOI(moduleInfo.type))) {
        deviceType = formatStringOI(moduleInfo.type);
    } else {
        // TODO: if device type could be read by console, check with espefuse.py --> if firmware is wrong, it could still detect the right device name
        // else ask the user
        let deviceSelected = await vscode.window.showQuickPick(deviceTypeList, { placeHolder: 'Choose the device type', ignoreFocusOut: true});
        if (deviceSelected !== undefined) {
            deviceType = formatStringOI(deviceSelected);
        } else {
            return;
        }
    }

    // Choose the version
    // Get path to resource on disk
    let onDiskPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'bin');
    let firmwareVersionList = await vscode.workspace.fs.readDirectory(onDiskPath);
    let binVersions: vscode.QuickPickItem[] = [];
    firmwareVersionList.forEach((element) => {
        if (element[1] === vscode.FileType.Directory) {
            if (element[0].split('oi-firmware-')[1].length >= 5) { // 0.0.0 --> min lenbgth is 5
                binVersions.unshift({label: element[0].split('oi-firmware-')[1]});
            }
        }
    });

    let version = await vscode.window.showQuickPick(binVersions, {
        placeHolder: "Select the version (choose the same version used for the main firmware)",
        ignoreFocusOut: true,
    });

    // Set the bin path and check it
    onDiskPath = vscode.Uri.joinPath(onDiskPath, 'oi-firmware-' + version?.label);
    let bootloader = vscode.Uri.joinPath(onDiskPath, deviceType + '_bootloader-' + version?.label + '.bin');
    let partitions = vscode.Uri.joinPath(onDiskPath, deviceType + '_partitions-' + version?.label + '.bin');
    let otaDataInitial = vscode.Uri.joinPath(onDiskPath, deviceType + '_ota_data_initial-' + version?.label + '.bin');
    let firmware = vscode.Uri.joinPath(onDiskPath, deviceType + '_firmware-' + version?.label + '.bin');

    if (fs.existsSync(bootloader.fsPath) === false) { return; }
    if (fs.existsSync(partitions.fsPath) === false) { return; }
    if (fs.existsSync(otaDataInitial.fsPath) === false) { return; }
    if (fs.existsSync(firmware.fsPath) === false) { return; }

    // Flash the Firmware
    let successFlash = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Flashing " + `OI${deviceType}` + " on " + `${moduleInfo.port}`,
        cancellable: true
    }, async (progress, cancellationToken) => {
        let successFlash = await new Promise( async (resolve) => {

            let options = {
                mode: "text" as "text",
                pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe',
                args: ['--chip', 'esp32s3',
                        '--port', moduleInfo.port,
                        '--baud', '921600',
                        'write_flash',
                        '0x0000', bootloader.fsPath,
                        '0x8000', partitions.fsPath,
                        '0xd000', otaDataInitial.fsPath, 
                        '0x10000', firmware.fsPath
                ] as string[]
            };

            let myPythonScriptPath = pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/esptool.exe';
            let pyshell = new PythonShell(myPythonScriptPath, options);
            let lastIncrement = 0;

            pyshell.on('message', function (message) {
                console.log(message);
                if (message.includes('%') && (message.includes("100 %") === false)) { // do not increment for 100% on bootloader, ota and partition
                    progress.report({increment: Number(message.split('(')[1].substring(0, 2)) - lastIncrement});
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
        return successFlash;
    });
        
    // Prompt a success message or an error message
    if (successFlash === true) {
        vscode.window.showInformationMessage("Device " + `${moduleInfo.port}` + " flashed successfuly");
    }
}