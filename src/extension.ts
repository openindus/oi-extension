import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import { multiStepInput } from './multiStepInput';
import { OIAccessTreeProvider } from './customTreeView';
import { deviceTypeList } from './deviceTypeList';
const pioNodeHelpers = require('platformio-node-helpers');

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

	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.updateDeviceId', async () => {
		
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
				return (parseInt(id) > 0 && parseInt(id) < 255) ? null : "ID is not valid !";
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
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.flashDeviceFirmware', async () => {
		
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
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.flashDeviceOnBus', async () => {
		
		// Display an error message because it is not implemented yet
		vscode.window.showErrorMessage("Sorry but this funtionnality is not implemented yet !");


		// // Retrieve available devices with getConnectedBoards.py
		// let portList = await getPortList(context, 'OICore');

		// if (portList === undefined || portList.length === 0) {
		// 	vscode.window.showWarningMessage("Could not find OICore on any port, please check connection between OICore and computer");
		// 	return;
		// }

		// let comSelected: string | undefined =  undefined;

		// if (portList.length > 1) {
		// 	comSelected = await vscode.window.showQuickPick(portList, { placeHolder: 'Select the device' });
		// } else if (portList.length = 1) {
		// 	comSelected = portList[0];
		// }
		
		// if (comSelected === undefined) { return; }

		// // Flash the Firmware with flashDeviceFirmware.py
		// let successFlash: Boolean = await vscode.window.withProgress({
		// 	location: vscode.ProgressLocation.Notification,
		// 	title: "Flashing",
		// 	cancellable: true
		// }, async () => {
		// 	const { successFlash } = await new Promise( resolve => {

		// 		let myPythonScriptPath = 'C:/Users/aurelien/.platformio/packages/framework-espidf/components/esptool_py/esptool/esptool.py';
		// 		let pyshell = new PythonShell(myPythonScriptPath);

		// 		pyshell.end(function (err: any, code: any) {
		// 			if (code === 0) {
		// 				resolve({ successFlash: true });
		// 			} else {
		// 				resolve({ successFlash: false });
		// 			}
		// 		});

		// 	});
		// 	return successFlash;
		// });
			
		// // Prompt a success message or an error message
		// if (successFlash === true) {
		// 	vscode.window.showInformationMessage("Device " + `${comSelected}` + " flashed successfuly");
		// } else {
		// 	vscode.window.showErrorMessage("Unexpected error while flashing device !");
		// }
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.openinduswebsite', () => {
		vscode.env.openExternal(vscode.Uri.parse('https://openindus.com'));
	}));

	// Check if .platformio path contains a space
	if (pioNodeHelpers.core.getCoreDir().indexOf(' ') >= 0)
	{
		vscode.window.showErrorMessage("We detected that you platformio path contains a white space, this will cause an error. Please check for available solutions on our website's FAQ");
	}
}

// this method is called when your extension is deactivated
export function deactivate() {}

async function getPortList(context: vscode.ExtensionContext, type?: string): Promise<string[] | undefined> {

	// Retrieve available devices with getConnectedBoards.py
	let portList: string[] = [];
	let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getConnectedDevices.py';
	let pyshell = new PythonShell(myPythonScriptPath, { mode: 'json', pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe' });

	pyshell.on('message', function (message) {
		message.devices.forEach((element: { type: string; port: string; }) => {
			if (type === undefined || (type !== undefined && element.type === type)) {
				if (element.type !== "undefined") {
					portList.push(element.port + " - " + deviceTypeList[parseInt(element.type)]);
				} else {
					portList.push(element.port);
				}
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