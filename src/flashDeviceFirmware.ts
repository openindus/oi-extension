import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import { deviceTypeList } from './deviceTypeList';
import { getPortList } from './getPortList';

const pioNodeHelpers = require('platformio-node-helpers');

export async function flashDeviceFirmware(context: vscode.ExtensionContext) {

    // Retrieve available devices with getConnectedBoards.py
    let portList = await getPortList(context);

    if (portList === undefined || portList.length === 0) {
        vscode.window.showWarningMessage("No device connected, please check connection between device and computer");
        return;
    }

    let comSelected: string | undefined =  undefined;

    if (portList.length > 1) {
        comSelected = await vscode.window.showQuickPick(portList, { placeHolder: 'Select the device' });
    } else if (portList.length = 1) {
        comSelected = portList[0];
    }
    
    if (comSelected === undefined) { return; }

    // Let the user choose the ID
    let deviceSelected = await vscode.window.showQuickPick(deviceTypeList, { placeHolder: 'Choose the device type' });

    if (deviceSelected === undefined) { return; }

    // Flash the Firmware with flashDeviceFirmware.py
    let successFlash: Boolean = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Flashing " + `${deviceSelected}` + " on " + `${comSelected}`,
        cancellable: true
    }, async () => {
        const { successFlash } = await new Promise( resolve => {
            let bootloader: string;
            let appFlashEsp32: string;
            let esptype: string;
            if (deviceSelected === 'OICore') {
                bootloader = context.asAbsolutePath('/resources/bin/') + 'bootloader_esp32.bin';
                appFlashEsp32 = context.asAbsolutePath('/resources/bin/') + 'app_flash_esp32.bin';
                esptype = "esp32";
            } else {
                bootloader = context.asAbsolutePath('/resources/bin/') + 'bootloader_esp32s2.bin';
                appFlashEsp32 = context.asAbsolutePath('/resources/bin/') + 'app_flash_esp32s2.bin';
                esptype = "esp32s2";
            }

            let firmware = context.asAbsolutePath('/resources/bin/') + deviceSelected?.toLowerCase().substring(2) + '.bin';
            let otaDataInitial = context.asAbsolutePath('/resources/bin/') + 'ota_data_initial.bin';
            let partitions = context.asAbsolutePath('/resources/bin/') + 'partitions.bin';

            let options = {
                mode: "text" as "text",
                pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe',
                args: ['--chip', esptype,
                        '--port', comSelected?.split(" ")[0],
                        '--baud', '921600',
                        'write_flash',
                        '-z',
                        '0x1000', bootloader,
                        '0x8000', partitions,
                        '0xd000', otaDataInitial, 
                        '0x20000', firmware, 
                        '0x3C0000', appFlashEsp32
                ] as string[]
            };

            let myPythonScriptPath = pioNodeHelpers.core.getCoreDir() + '/packages/framework-espidf/components/esptool_py/esptool/esptool.py';
            let pyshell = new PythonShell(myPythonScriptPath, options);

            pyshell.on('message', function (message) {
                console.log(message);
            });

            pyshell.end(function (err: any, code: any) {
                if (code === 0) {
                    resolve({ successFlash: true });
                } else {
                    resolve({ successFlash: false });
                }
            });

        });
        return successFlash;
    });
        
    // Prompt a success message or an error message
    if (successFlash === true) {
        vscode.window.showInformationMessage("Device " + `${comSelected}` + " flashed successfuly");
    } else {
        vscode.window.showErrorMessage("Unexpected error while flashing device !");
    }
}