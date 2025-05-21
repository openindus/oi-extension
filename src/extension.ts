import * as vscode from 'vscode';
import { OIAccessTreeProvider } from './customTreeView';
import { createProject } from './createProject';
import { flashDeviceFirmware } from './flashDeviceFirmware';
import { getSystemInfo } from './getSystemInfo';
import { ModuleInfo, execShell, getPlatformIOPythonPath, downloadNewFirmwareOnline } from './utils';
import { flashSlaveDeviceFirmware } from './flashSlaveDeviceFirmware';
import { startStepperPanelConfig } from './panels/stepperParam';

const pioNodeHelpers = require('platformio-node-helpers');

var commandReadyCreateProject: Boolean = true;
var commandReadyGetSystemInfo: Boolean = true;
var commandReadyFlashDeviceFirmware: Boolean = true;
var commandReadyFlashSlavesDevicesFirmware: Boolean = true;

export var logger: vscode.LogOutputChannel;

export async function activate(context: vscode.ExtensionContext) {

    logger = vscode.window.createOutputChannel("OpenIndus Extension", {log: true});
	logger.info("OpenIndus Extension Activated");

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

	context.subscriptions.push(vscode.commands.registerCommand('openindus.startStepperPanelConfig', async ( portName?: string, moduleInfo?: ModuleInfo) => {
		await startStepperPanelConfig(context, portName, moduleInfo);
	}));

	// Check if .platformio path contains a space
	if (pioNodeHelpers.core.getCoreDir().indexOf(' ') >= 0)
	{
		vscode.window.showErrorMessage("We detected that you platformio path contains a white space, this will cause an error. Please check for available solutions on our website's FAQ");
	}

	// Install esptool if not already installed
	logger.info(await execShell(getPlatformIOPythonPath() + ' -m pip install esptool', './'));

	// Download the latets firmware from openindus server at each launch of application
	await downloadNewFirmwareOnline(context);
}

// this method is called when your extension is deactivated
export function deactivate() {}