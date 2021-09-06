import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import { multiStepInput } from './multiStepInput';
import { OIAccessTreeProvider } from './customTreeView';
import { deviceTypeList } from './deviceTypeList';

export function activate(context: vscode.ExtensionContext) {

	vscode.window.registerTreeDataProvider('openindus-treeview', new OIAccessTreeProvider());

	context.subscriptions.push(vscode.commands.registerCommand('openindus.createproject', () => {
		multiStepInput(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.getDeviceId', async () => {

		let portList = await getPortList(context);

		if (portList === undefined || portList.length === 0) {
			vscode.window.showWarningMessage("No device connected, please check connection between device and computer");
			return;
		}

		// Let the user choose the device
		let comSelected = await vscode.window.showQuickPick(portList, {
			placeHolder: 'Select the device'
		});

		if (comSelected === undefined) {
			return;
		}
				
		let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getDeviceId.py';
		let pyshell = new PythonShell(myPythonScriptPath, { mode: "json", args: [comSelected]});
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

	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.updateDeviceId', async () => {
		
		// Retrieve available devices with getConnectedBoards.py
		let portList = await getPortList(context);

		if (portList === undefined || portList.length === 0) {
			vscode.window.showWarningMessage("No device connected, please check connection between device and computer");
			return;
		}

		// Let the user choose the device
		let comSelected = await vscode.window.showQuickPick(portList, {
			placeHolder: 'Select the device'
		});

		if (comSelected === undefined) {
			return;
		}

		// Let the user choose the ID
		let idSelected = await vscode.window.showInputBox({
			valueSelection: [1, 254],
			placeHolder: 'Enter the ID',
			validateInput: id => {
				return (parseInt(id) > 0 && parseInt(id) < 255) ? null : "ID is not valid !";
			}
		});

		// Set the ID with setDeviceId.py
		if (comSelected === undefined || idSelected === undefined) {
			return;
		}
				
		let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/setDeviceId.py';
		let pyshell = new PythonShell(myPythonScriptPath, { args: [comSelected, idSelected]});

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
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.flashDeviceFirmware', async () => {
		
		// Retrieve available devices with getConnectedBoards.py

		let portList = await getPortList(context);

		if (portList === undefined || portList.length === 0) {
			vscode.window.showWarningMessage("No device connected, please check connection between device and computer");
			return;
		}

		// Let the user choose the device
		let comSelected = await vscode.window.showQuickPick(portList, {
			placeHolder: 'Select the device'
		});

		if (comSelected === undefined) {
			return;
		}

		// Let the user choose the ID
		let deviceSelected = await vscode.window.showQuickPick(deviceTypeList, {
			placeHolder: 'Choose the device type'
		});

		if (deviceSelected === undefined) {
			return;
		}

		// Flash the Firmware with flashDeviceFirmware.py
		let successFlash: Boolean = await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Flashing " + `${deviceSelected}` + " firmware to device " + `${comSelected}`,
			cancellable: true
		}, async () => {
			const { successFlash } = await new Promise( resolve => {
				if (comSelected === undefined || deviceSelected === undefined) {
					return;
				}
				let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/flashDeviceFirmware.py';
				let pyshell = new PythonShell(myPythonScriptPath, { mode: 'json', args: [comSelected, deviceSelected]});
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
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.openinduswebsite', () => {
		vscode.env.openExternal(vscode.Uri.parse('https://openindus.com'));
	}));

}

// this method is called when your extension is deactivated
export function deactivate() {}


async function getPortList(context: vscode.ExtensionContext): Promise<string[] | undefined> {

	// Retrieve available devices with getConnectedBoards.py
	let portList: string[] = [];
	let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getConnectedDevices.py';
	let pyshell = new PythonShell(myPythonScriptPath, { mode: 'json', pythonPath: });

	pyshell.on('message', function (message) {
		message.devices.forEach((element: { type: string; port: string; }) => {
			if (element.type !== "undefined") {
				portList.push(element.port + " - " + element.type);
			} else {
				portList.push(element.port);
			}
		});
	});

	const { success } = await new Promise( resolve => {
		pyshell.end(function (err: any, code: any) {
			if (code === 0) {
				resolve({ success: true });
			} else {
				resolve({ success: false });
			}
		});
	});

	if (success === false) {
		return undefined;
	} else {
		return portList;
	}
}
