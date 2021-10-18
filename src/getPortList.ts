import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import { deviceTypeList } from './utils';

const pioNodeHelpers = require('platformio-node-helpers');

export async function getPortList(context: vscode.ExtensionContext, type?: string): Promise<string[] | undefined> {

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