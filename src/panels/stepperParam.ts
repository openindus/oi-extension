import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { OIStepper } from "../com/OIStepper";
import { logger } from "../extension";
import { ModuleInfo } from '../utils';

var currentPanel:vscode.WebviewPanel = undefined;
var stepper:OIStepper = undefined;

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
					stepper = new OIStepper(message.portName, message?.serialNum);
					await stepper.connect().then((response) => {
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						vscode.window.showErrorMessage("Error while connecting to OIStepper (" + message.portName + "): " + error);
					});
					break;
				case 'disconnect':
					await stepper.disconnect().then((response) => {
						stepper = undefined;
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						vscode.window.showErrorMessage("Error while disconnecting  from OIStepper: " + error);
						panel.webview.postMessage({command: message.command, response: false}); // Send a message to display "connect button again"	
					});
					break;
				case 'list':
					await OIStepper.listStepper().then((response) => {
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						vscode.window.showErrorMessage("Cannot get list of connected device: " + error);
					});
					break;
				case 'cmd':
					await stepper.cmd(message.args).then((response) => {
						panel.webview.postMessage({command: message.command, response: response});
					}).catch((error) => {
						vscode.window.showErrorMessage("Cannot send command (" + message.args.join(' ') + "): " + error);
					});
					break;
				case 'get-parameters':
					await stepper.getParam(message.args[0]).then((response) => {
						panel.webview.postMessage({ command: message.command, response: response });
					}).catch((error) => {
						vscode.window.showErrorMessage("Error while getting parameters on OIStepper: " + error);
					});
					break;
				case 'set-parameters':
					await stepper.setParam(message.args[0], message.args[1]).then(() => {
						panel.webview.postMessage({ command: message.command, response: true });
					}).catch((error) => {
						vscode.window.showErrorMessage("Error while setting parameters on OIStepper: " + error);
					});
					break;
				case 'reset-parameters':
					await stepper.resetParam(message.args[0]).then(() => {
						panel.webview.postMessage({ command: message.command, response: true });
					}).catch((error) => {
						vscode.window.showErrorMessage("Error while setting parameters on OIStepper: " + error);
					});
					break;
				default:
					break;
			}
		},
        undefined,
        context.subscriptions
	);

	// If stepper info where given, create the stepper object
	if (portName && stepperModuleInfo) {
		stepper = new OIStepper(portName, stepperModuleInfo.serialNum);
		await stepper.connect().then((response) => {
			panel.webview.postMessage({command: 'connect', response: response});
		}).catch((error) => {
			vscode.window.showErrorMessage("Error while connecting to OIStepper (" + portName + "): " + error);
		});
	}
}