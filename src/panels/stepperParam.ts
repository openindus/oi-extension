import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { OIStepper } from "../com/OIStepper";
import { logger } from "../extension";
import { ModuleInfo } from '../utils';

var currentPanel:vscode.WebviewPanel = undefined;
var stepper:OIStepper = undefined

export async function startStepperPanelConfig(context: vscode.ExtensionContext, portName?: string, stepperModuleInfo?: ModuleInfo) {
    
    // If we already have a panel, show it.
    if (currentPanel !== undefined) {
        currentPanel.reveal();
        return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel('OIStepperConfig', 'OIStepperConfig', vscode.ViewColumn.One, {enableScripts: true});
    currentPanel = panel;

	fs.readFile(path.join(context.extensionPath, 'resources', 'html', 'stepper.html'), (err,data) => {
		if (err) {
			logger.error(err);
		} else {
			let rawHTML = data.toString();
			panel.webview.html = rawHTML;
		}
	});

	// If stepper info where given, create the stepper object
	if (portName && stepperModuleInfo) {
		stepper = new OIStepper(portName, stepperModuleInfo.serialNum);
	}
			
			

	panel.onDidDispose(async () => {
		currentPanel = undefined;
		await stepper?.disconnect();
		stepper = undefined;
	});
				

	panel.webview.onDidReceiveMessage(
		async message => {
			switch (message.command) {
				case 'connect':
					if (stepper?.isOpen) {
						panel.webview.postMessage({command: message.command, response: "error: already connected"});
						return;
					}
					stepper = new OIStepper(message.portName, message.serialNum);
					await stepper.connect().then((response) => {
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						panel.webview.postMessage({command: message.command, response: error});
					});
				case 'disconnect':
					await stepper.disconnect().then((response) => {
						stepper = undefined;
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						panel.webview.postMessage({command: message.command, response: error});
					});
				case 'list':
					await stepper.list().then((response) => {
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						panel.webview.postMessage({command: message.command, response: error});
					});
				case 'cmd':
					await stepper.cmd(message.args).then((response) => {
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						panel.webview.postMessage({command: message.command, response: error});
					});
				default:
					break;
			}
		},
        undefined,
        context.subscriptions
	);
}