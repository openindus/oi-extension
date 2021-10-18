import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import { getPortList } from './getPortList';

const pioNodeHelpers = require('platformio-node-helpers');

export async function getDeviceId(context: vscode.ExtensionContext) {

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
            
    let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getDeviceId.py';
    let pyshell = new PythonShell(myPythonScriptPath, { mode: "json", pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe', args: [comSelected]});
    let idReturn = -1;

    pyshell.on('message', function (message) {
        idReturn = parseInt(message.id);
    });

    const { successGetId } = await new Promise( resolve => {
        pyshell.end(function (err: any, code: any) {
            if (code === 0) {
                resolve({ successGetId: true });
            } else {
                resolve({ successGetId: false });
            }
        });
    });

    // Prompt a success message or an error message
    if (successGetId === true && idReturn >= 0 && idReturn <= 255) {
        vscode.window.showInformationMessage(`${comSelected}` + " ID is " + `${idReturn}`);
    } else {
        vscode.window.showErrorMessage("Unexpected error while getting ID");
    }
}