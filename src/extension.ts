import * as vscode from 'vscode';
import { OIAccessTreeProvider } from './customTreeView';
import { createProject } from './createProject';
import { flashDeviceFirmware } from './flashDeviceFirmware';
import { getDeviceInfo } from './getDeviceInfo';

const pioNodeHelpers = require('platformio-node-helpers');

export function activate(context: vscode.ExtensionContext) {

	vscode.window.registerTreeDataProvider('openindus-treeview', new OIAccessTreeProvider());

	context.subscriptions.push(vscode.commands.registerCommand('openindus.createproject', async () => {
		await createProject(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.getDeviceInfo', async () => {
		await getDeviceInfo(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.flashDeviceFirmware', async () => {
		await flashDeviceFirmware(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.flashDeviceOnBus', async () => {
		// Display an error message because it is not implemented yet
		vscode.window.showErrorMessage("Sorry but this funtionnality is not implemented yet !");
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