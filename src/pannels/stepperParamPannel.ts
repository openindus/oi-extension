import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import {Mutex} from 'async-mutex';
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
    const pannel = vscode.window.createWebviewPanel(
		'OIStepperConfig',
		'OIStepperConfig',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true
		}
	);

    currentPanel = pannel;

	const contentUri = pannel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resources', 'html', 'content'));

	fs.readFile(path.join(context.extensionPath, 'resources', 'html', 'stepper.html'), (err,data) => {
		if (err) {
			logger.error(err);
		} else {
			let rawHTML = data.toString();
			rawHTML = rawHTML.replaceAll('${content}', contentUri.toString());
			pannel.webview.html = rawHTML;
		}
	});

	var receivedMessageMutex = new Mutex();
	var lastCommand = '';
	var normalDisconnect = false; // Set this var to true when the disconnection is wanted

	// Handler functions
	async function handleConnect(message: any) {
		if (stepper?.isOpen) {
			pannel.webview.postMessage({command: message.command, response: "error: already connected"});
			return;
		}
		// Recreate the object if data where given
		if ((stepper === undefined) || (message?.portName !== undefined)) {
			stepper = undefined;
			stepper = new OIStepper(message.portName, message?.serialNum, message?.id, message?.onBus);
		}
		await stepper.connect().then((response) => {
			normalDisconnect = false;
			pannel.webview.postMessage({command: message.command, response: response});
		}).catch((error) => {
			vscode.window.showErrorMessage("Error while connecting to OIStepper (" + message.portName + "): " + error);
		});
	}

	async function handleDisconnect(message: any) {
		await stepper?.disconnect().then((response) => {
			if (message.doNotDelete === undefined) {
				stepper = undefined;
			}
			normalDisconnect = true;
			pannel.webview.postMessage({command: message.command, response: response});
		}).catch((error) => {
			vscode.window.showErrorMessage("Error while disconnecting from OIStepper: " + error);
			pannel.webview.postMessage({command: message.command, response: false});
		});
	}

	async function handleList(message: any) {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Getting OIStepper device list...`,
			cancellable: false
		}, async () => {
			await OIStepper.listStepper().then((response) => {
				pannel.webview.postMessage({command: message.command, response: response});
			}).catch((error) => {
				vscode.window.showErrorMessage("Cannot get list of connected device: " + error);
			});
		});
	}

	async function handleCmd(message: any) {
		await stepper?.cmd(message.args).then((response) => {
			pannel.webview.postMessage({command: message.command, response: response});
		}).catch((error) => {
			if (!normalDisconnect) {
				vscode.window.showErrorMessage("Cannot send command (" + message.args.join(' ') + "): " + error);						
				if (error.includes("disconnected")) {
					pannel.webview.postMessage({command: 'disconnect', response: true});
				}
			}
		});
	}

	async function handleGetParameters(message: any) {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Getting OIStepper parameters...`,
			cancellable: false
		}, async () => {
			await stepper?.getParam(message.args[0]).then((response) => {
				pannel.webview.postMessage({ command: message.command, response: response }).then(() => {
					vscode.window.showInformationMessage("Get parameter successfully on OIStepper.");
				});
			}).catch((error) => {
				if (!normalDisconnect) {
					vscode.window.showErrorMessage("Error while getting parameters on OIStepper: " + error);						
					if (error.includes("disconnected")) {
						pannel.webview.postMessage({command: 'disconnect', response: true});
					}
				}
			});
		});
	}

	async function handleSetParameters(message: any) {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Setting OIStepper parameters...`,
			cancellable: false
		}, async () => {
			await stepper?.setParam(message.args[0], message.args[1]).then(() => {
				pannel.webview.postMessage({ command: message.command, response: true }).then(() => {
					vscode.window.showInformationMessage("Parameters set successfully on OIStepper.");
				});
			}).catch((error) => {
				if (!normalDisconnect) {
					vscode.window.showErrorMessage("Error while setting parameters on OIStepper: " + error);						
					if (error.includes("disconnected")) {
						pannel.webview.postMessage({command: 'disconnect', response: true});
					}
				}
			});
		});
	}

	async function handleResetParameters(message: any) {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Resetting OIStepper parameters...`,
			cancellable: false
		}, async () => {
			await stepper?.resetParam(message.args[0]).then(() => {
				pannel.webview.postMessage({ command: message.command, response: true }).then(() => {
					vscode.window.showInformationMessage("Parameters where resetted successfully on OIStepper. Reading parameters again to get the default values.");
				});
			}).catch((error) => {
				if (!normalDisconnect) {
					vscode.window.showErrorMessage("Error while setting parameters on OIStepper: " + error);						
					if (error.includes("disconnected")) {
						pannel.webview.postMessage({command: 'disconnect', response: true});
					}
				}
			});
		});
	}

	async function handleSaveParameters(message: any) {
		await vscode.window.showSaveDialog().then((fileUri) => {
			if (fileUri.fsPath !== undefined) {
				fs.writeFileSync(fileUri.fsPath, JSON.stringify(message.args[0], null, 2));
			}
		});
	}

	async function handleLoadParameters(message: any) {
		await vscode.window.showOpenDialog().then((fileUri) => {
			if (fileUri && fileUri[0]) {
				const filePath = fileUri[0].fsPath;
				fs.readFile(filePath, 'utf8', (err, data) => {
					if (err) {
						vscode.window.showErrorMessage("Error reading file: " + err.message);
					} else {
						try {
							const parameters = JSON.parse(data);
							pannel.webview.postMessage({ command: message.command, response: parameters }).then(() => {
								vscode.window.showInformationMessage("Parameters where loaded successfully from " + filePath);
							});
						} catch (parseError) {
							vscode.window.showErrorMessage("Error parsing JSON: " + parseError.message);
						}
					}
				});
			}
		});
	}

	async function handleGetStatus(message: any) {
		await stepper?.getStatus().then((response) => {
			pannel.webview.postMessage({command: message.command, response: response});
		}).catch((error) => {
			if (!normalDisconnect) {
				vscode.window.showErrorMessage("Cannot get status from OIStepper: " + error);
				if (error.includes("disconnected")) {
					pannel.webview.postMessage({command: 'disconnect', response: true});
				}
			}
		});
	}


	pannel.webview.onDidReceiveMessage( 
		async (message) => {
			// If mutex is locked and message is a "get-status" or a message already sent (multiple user clicks), ignore the message
			if (receivedMessageMutex.isLocked()) {
				if (message.command === 'get-status' || (message.command + message.args?.join()) === lastCommand) {
					logger.info("Received message while mutex is locked, ignoring message: " + JSON.stringify(message));
					return;
				}
			} else {
				lastCommand = message.command + message.args?.join();
			}
			await receivedMessageMutex.acquire();
			switch (message.command) {
				case 'connect':
					await handleConnect(message);
					break;
				case 'disconnect':
					await handleDisconnect(message);
					break;
				case 'list':
					await handleList(message);
					break;
				case 'cmd':
					await handleCmd(message);
					break;
				case 'get-parameters':
					await handleGetParameters(message);
					break;
				case 'set-parameters':
					await handleSetParameters(message);
					break;
				case 'reset-parameters':
					await handleResetParameters(message);
					break;
				case 'save-parameters':
					await handleSaveParameters(message);
					break;
				case 'load-parameters':
					await handleLoadParameters(message);
					break;
				case 'get-status':
					await handleGetStatus(message);
					break;
				default:
					break;
			}
			receivedMessageMutex.release();
		},
        undefined,
        context.subscriptions
	);

	pannel.onDidChangeViewState((e) => {
		if (!pannel.visible && stepper !== undefined) {
			handleDisconnect({command: 'disconnect', doNotDelete: true});
		} else if (pannel.visible && stepper !== undefined) {
			handleConnect({command: 'connect'});
		}
	});

	pannel.onDidDispose(async () => {
		handleDisconnect({command: 'disconnect'});
		currentPanel = undefined;
	});

	// If stepper info where given, create the stepper object
	if (portName && stepperModuleInfo) {
		handleConnect({
			command: 'connect',
			portName: portName,
            serialNum: stepperModuleInfo.serialNum,
            id: undefined,
			onBus: false
		});
	} else {
		// Do an automatic refresh
		handleList({command: 'list'});
	}	
}