import * as vscode from 'vscode';

import { OIAccessTreeProvider } from './customTreeView';
import { createProject } from './createProject';
import { ModuleInfo, downloadNewFirmwaresOnline, downloadNewLibrariesOnline } from './utils';
import { flashDeviceFirmware } from './flashDeviceFirmware';
import { flashSlaveDeviceFirmware } from './flashSlaveDeviceFirmware';
import { getSystemInfo } from './pannels/systemInfoPannel';
import { startStepperPanelConfig } from './pannels/stepperParamPannel';

let commandReadyCreateProject = true;
let commandReadyGetSystemInfo = true;
let commandReadyFlashDeviceFirmware = true;
let commandReadyFlashSlavesDevicesFirmware = true;

export let logger: vscode.LogOutputChannel;

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

	// Download the latets firmware from openindus server at each launch of application
	await downloadNewFirmwaresOnline(context);
	await downloadNewLibrariesOnline(context);
}

// this method is called when your extension is deactivated
export function deactivate() {}