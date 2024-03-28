import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import { deviceTypeList, formatStringOI, getFormatedDeviceList, binAddress, pickDevice, ModuleInfo } from './utils';
import * as fs from 'fs';
const pioNodeHelpers = require('platformio-node-helpers');

export async function flashSlaveDeviceFirmware(context: vscode.ExtensionContext, masterPortName: string, slaveModuleInfo: ModuleInfo, version?: string) {

    let deviceType: string = "";

    // Check if device type is known
    if (getFormatedDeviceList().includes(formatStringOI(slaveModuleInfo.type))) {
        deviceType = formatStringOI(slaveModuleInfo.type);
    } else {
        return;
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

    if (version === undefined) {
        version = (await vscode.window.showQuickPick(binVersions, {
            placeHolder: "Select the version (choose the same version used for the main firmware)",
            ignoreFocusOut: true,
        }))?.label;
    }

    // Set the bin path and check it
    onDiskPath = vscode.Uri.joinPath(onDiskPath, 'oi-firmware-' + version);
    let firmware = vscode.Uri.joinPath(onDiskPath, deviceType + '_firmware-' + version + '.bin');
    if (fs.existsSync(firmware.fsPath) === false) { return; }

    // Set the slave in program mode
    let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/program.py';
	let pyshell = new PythonShell(myPythonScriptPath, { mode: 'text', args: [masterPortName, slaveModuleInfo.serialNum], pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe' });

	pyshell.on('message', function (message) {
        console.log(message);
	});

	let success = await new Promise( resolve => {
		pyshell.end(function (err: any, code: any) {
			if (code === 0) {
				resolve(true);
			} else {
				resolve(false);
			}
		});
	});

	if (success === false) {
        vscode.window.showErrorMessage("Unexpected error while flashing device !");
        return;
	}

    // Flash the Firmware
    let successFlash = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Flashing OI${deviceType} on Bus`,
        cancellable: true
    }, async (progress, cancellationToken) => {
        let successFlash = await new Promise( async (resolve) => {

            let options = {
                mode: "text" as "text",
                pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe',
                args: [ '--port', masterPortName,
                        '--baud', '115200',
                        '--before', 'no_reset',
                        '--no-stub',
                        'write_flash',
                        '0x110000', firmware.fsPath
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
        vscode.window.showInformationMessage("Device " + `${slaveModuleInfo.type}` + " flashed successfuly");
    } else {
        vscode.window.showErrorMessage("Unexpected error while flashing device !");
    }
}