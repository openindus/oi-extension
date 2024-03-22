import * as vscode from 'vscode';
import { PythonShell } from 'python-shell';
import { ModuleInfo } from './utils';

const pioNodeHelpers = require('platformio-node-helpers');

export async function getSlaveDeviceInfoList(context: vscode.ExtensionContext, token: vscode.CancellationToken, scanPort: string): Promise<ModuleInfo[] | undefined> {

	// Retrieve available devices with getConnectedBoards.py
	let moduleInfoList: ModuleInfo[] = [];

	let myPythonScriptPath = context.asAbsolutePath('/resources/scripts') + '/getSlaveDevices.py';
	let pyshell = new PythonShell(myPythonScriptPath, { mode: 'json', args: [scanPort, scanPort], pythonPath: pioNodeHelpers.core.getCoreDir() + '/penv/Scripts/python.exe' });

	pyshell.on('message', function (message) {
		console.log(message);
		message.forEach((element: { port: string; type: string; serialNum: string, versionHw: string, versionSw: string}) => {
			moduleInfoList.push({
				port: element.port,
				type: element.type,
				serialNum: element.serialNum,
				versionHw: element.versionHw,
				versionSw: element.versionSw,
				imgName: "",
				caseName: ""
			});
		});
	});

	let success = await new Promise( resolve => {
		token.onCancellationRequested(() => {
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

	if (success === false) {
		return undefined;
	} else {
		return moduleInfoList;
	}
}