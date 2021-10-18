import * as vscode from 'vscode';
import * as fs from 'fs';
import { PythonShell } from 'python-shell';
import { deviceTypeList, binAddress } from './utils';
import { getPortList } from './getPortList';
import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";

const pioNodeHelpers = require('platformio-node-helpers');

export async function flashDeviceFirmware(context: vscode.ExtensionContext) {

    // Retrieve available devices with getConnectedBoards.py
    const portList = await getPortList(context);
	const fileDownloader: FileDownloader = await getApi();

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

    await fileDownloader.downloadFile(
        vscode.Uri.parse(binAddress),
        "fileListAsHtml",
        context,
        undefined,
        undefined
    );

    let binVersions: vscode.QuickPickItem[] = [];

    const downloadedFile: vscode.Uri | undefined = await fileDownloader.tryGetItem("fileListAsHtml", context);

    if (downloadedFile !== undefined) {
        fs.readFileSync(downloadedFile.fsPath, 'utf8').split(/href="oi-firmware-/).forEach(function(line) {
            if (line[0] !== "<") {
                binVersions.unshift({label: line.split('/')[0]});
            }
        });

        if (binVersions.length === 0) {
            vscode.window.showErrorMessage("Cannot retrieve binaries version, please check your internet connection !");
            return;
        }

        binVersions[0].description = "latest";

        await fileDownloader.deleteItem("fileListAsHtml", context);
    }
    else {
        vscode.window.showErrorMessage("Cannot retrieve binaries version, please check your internet connection !");
        // TODO: check local files instead how returning an error
        return;
    }

    const version = await vscode.window.showQuickPick(binVersions, {
        placeHolder: "Select the version (choose the same vesion you use for the main firmware)",
    });

    if (version === undefined) { return; }
    // Flash the Firmware with flashDeviceFirmware.py
    let successFlash: Boolean = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Flashing " + `${deviceSelected}` + " on " + `${comSelected}`,
        cancellable: true
    }, async (progress, cancellationToken) => {
        const { successFlash } = await new Promise( async (resolve) => {
            
            const bootloader = await fileDownloader.downloadFile(
                vscode.Uri.parse(binAddress + "oi-firmware-" + version.label + '/' + deviceSelected?.toLowerCase().substring(2) + '_bootloader-' + version.label + '.bin'),
                deviceSelected?.toLowerCase().substring(2) + '_bootloader-' + version.label + '.bin',
                context,
                cancellationToken,
                undefined
            );

            const firmware = await fileDownloader.downloadFile(
                vscode.Uri.parse(binAddress + "oi-firmware-" + version.label + '/' + deviceSelected?.toLowerCase().substring(2) + '_firmware-' + version.label + '.bin'),
                deviceSelected?.toLowerCase().substring(2) + '_firmware-' + version.label + '.bin',
                context,
                cancellationToken,
                undefined
            );

            const otaDataInitial = await fileDownloader.downloadFile(
                vscode.Uri.parse(binAddress + "oi-firmware-" + version.label + '/' + deviceSelected?.toLowerCase().substring(2) + '_ota_data_initial-' + version.label + '.bin'),
                deviceSelected?.toLowerCase().substring(2) + '_ota_data_initial-' + version.label + '.bin',
                context,
                cancellationToken,
                undefined
            );

            const partitions = await fileDownloader.downloadFile(
                vscode.Uri.parse(binAddress + "oi-firmware-" + version.label + '/' + deviceSelected?.toLowerCase().substring(2) + '_partitions-' + version.label + '.bin'),
                deviceSelected?.toLowerCase().substring(2) + '_partitions-' + version.label + '.bin',
                context,
                cancellationToken,
                undefined
            );

            let esptype: string;

            if (deviceSelected === 'OICore') {
                esptype = "esp32";
            } else {
                esptype = "esp32s2";
            }

            let options = {
                mode: "text" as "text",
                pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe',
                args: ['--chip', esptype,
                        '--port', comSelected?.split(" ")[0],
                        '--baud', '921600',
                        'write_flash',
                        '-z',
                        '0x1000', bootloader.fsPath,
                        '0x8000', partitions.fsPath,
                        '0xd000', otaDataInitial.fsPath, 
                        '0x20000', firmware.fsPath
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