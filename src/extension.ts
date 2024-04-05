import * as vscode from 'vscode';
import { OIAccessTreeProvider } from './customTreeView';
import { createProject } from './createProject';
import { flashDeviceFirmware } from './flashDeviceFirmware';
import { getSystemInfo } from './getSystemInfo';
import { execShell, getPlatformIOPythonPath } from './utils';

const pioNodeHelpers = require('platformio-node-helpers');

export async function activate(context: vscode.ExtensionContext) {

	vscode.window.registerTreeDataProvider('openindus-treeview', new OIAccessTreeProvider());

	context.subscriptions.push(vscode.commands.registerCommand('openindus.createProject', async () => {
		await createProject(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.getSystemInfo', async () => {
		await getSystemInfo(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.flashDeviceFirmware', async () => {
		await flashDeviceFirmware(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.openinduswebsite', () => {
		vscode.env.openExternal(vscode.Uri.parse('https://openindus.com'));
	}));

	// Check if .platformio path contains a space
	if (pioNodeHelpers.core.getCoreDir().indexOf(' ') >= 0)
	{
		vscode.window.showErrorMessage("We detected that you platformio path contains a white space, this will cause an error. Please check for available solutions on our website's FAQ");
	}

	// Install esptool if not already installed
	console.log(await execShell(getPlatformIOPythonPath() + ' -m pip install esptool', './'));
}

// this method is called when your extension is deactivated
export function deactivate() {}