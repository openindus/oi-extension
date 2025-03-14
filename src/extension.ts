import * as vscode from 'vscode';
import { OIAccessTreeProvider } from './customTreeView';
import { createProject } from './createProject';
import { flashDeviceFirmware } from './flashDeviceFirmware';
import { getSystemInfo } from './getSystemInfo';
import { ModuleInfo, execShell, getPlatformIOPythonPath } from './utils';
import { flashSlaveDeviceFirmware } from './flashSlaveDeviceFirmware';

const pioNodeHelpers = require('platformio-node-helpers');

var commandReadyCreateProject: Boolean = true;
var commandReadyGetSystemInfo: Boolean = true;
var commandReadyFlashDeviceFirmware: Boolean = true;
var commandReadyFlashSlavesDevicesFirmware: Boolean = true;

export async function activate(context: vscode.ExtensionContext) {

	vscode.window.registerTreeDataProvider('openindus-treeview', new OIAccessTreeProvider());

	context.subscriptions.push(vscode.commands.registerCommand('openindus.createProject', async (master?: ModuleInfo, slaves?: ModuleInfo[]) => {
		if (commandReadyCreateProject) {
			commandReadyCreateProject = false;
			await createProject(context, master, slaves);
			commandReadyCreateProject = true;
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.getSystemInfo', async (portName?: string) => {
		if (commandReadyGetSystemInfo) {
			commandReadyGetSystemInfo = false;
			await getSystemInfo(context, portName);
			commandReadyGetSystemInfo = true;
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.flashDeviceFirmware', async ( portName?: string, inputModuleInfo?: ModuleInfo) => {
		if (commandReadyFlashDeviceFirmware) {
			commandReadyFlashDeviceFirmware = false;
			await flashDeviceFirmware(context, portName, inputModuleInfo);
			commandReadyFlashDeviceFirmware = true;
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openindus.flashSlavesDevicesFirmware', async ( masterPortName: string, slavesModuleInfo: ModuleInfo[]) => {
		if (commandReadyFlashSlavesDevicesFirmware) {
			commandReadyFlashSlavesDevicesFirmware = false;
			await flashSlaveDeviceFirmware(context, masterPortName, slavesModuleInfo);
			commandReadyFlashSlavesDevicesFirmware = true;
		}
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