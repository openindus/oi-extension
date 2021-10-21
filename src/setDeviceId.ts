import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import { getPortList } from './getPortList';

const pioNodeHelpers = require('platformio-node-helpers');

export async function setDeviceId(context: vscode.ExtensionContext) {

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
    let idSelected = await vscode.window.showInputBox({
        valueSelection: [1, 254],
        placeHolder: 'Enter the ID',
        validateInput: id => {
            return (parseInt(id) >= 0 && parseInt(id) < 255) ? null : "ID is not valid !";
        }
    });

    // Set the ID with setDeviceId.py
    if (comSelected === undefined || idSelected === undefined) {
        return;
    }
            
    let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/setDeviceId.py';
    let pyshell = new PythonShell(myPythonScriptPath, { pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe', args: [comSelected, idSelected]});

    const { successflash } = await new Promise( resolve => {
        pyshell.end(function (err: any, code: any) {
            if (code === 0) {
                resolve({ successflash: true });
            } else {
                resolve({ successflash: false });
            }
        });
    });

    // Prompt a success message or an error message
    if (successflash === true) {
        vscode.window.showInformationMessage("Setting ID: " + `${idSelected}` + " to device " + `${comSelected}`);
    } else {
        vscode.window.showErrorMessage("Unexpected error while setting ID");
    }
}