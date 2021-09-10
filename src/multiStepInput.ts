/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window, Disposable, QuickInputButton, QuickInput, ExtensionContext, QuickInputButtons, OpenDialogOptions, Uri, workspace, commands } from 'vscode';
import * as fs from 'fs';
import { deviceTypeList } from './deviceTypeList';
import { PythonShell } from 'python-shell';

/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 * 
 * This first part uses the helper class `MultiStepInput` that wraps the API for the multi-step case.
 */
export async function multiStepInput(context: ExtensionContext) {

	const boardsNames: QuickPickItem[] = deviceTypeList.map(label => ({ label }));

	const options: OpenDialogOptions = {
		canSelectMany: false,
		openLabel: 'Select Folder',
		canSelectFiles: false,
		canSelectFolders: true,
		title: 'Select a root folder for your application'
	};

	interface State {
		title: string;
		step: number;
		totalSteps: number;
		board: QuickPickItem;
		name: string;
        path: string;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => pickBoard(input, state));
		return state as State;
	}

	const title = 'Create a Template Application';

	async function pickFolder(input: MultiStepInput, state: Partial<State>) {
		state.path = await window.showOpenDialog(options).then(fileUri => {
            if (fileUri && fileUri[0]) {
                return fileUri[0].fsPath;
            }
			else {
				throw InputFlowAction.cancel;
			}
        });
		return (input: MultiStepInput) => inputName(input, state);
	}

	async function pickBoard(input: MultiStepInput, state: Partial<State>) {
		state.board = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: 3,
			placeholder: 'Choose a board',
			items: boardsNames,
			activeItem: typeof state.board !== 'string' ? state.board : boardsNames[0],
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => pickFolder(input, state);
	}

	async function inputName(input: MultiStepInput, state: Partial<State>) {
		state.name = await input.showInputBox({
			title,
			step: 3,
			totalSteps: 3,
			value: state.name || '',
			prompt: 'Choose a name for your application',
			validate: validateNameIsUnique,
            path: state.path,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => createApp(input, <State>state);
	}

	async function createApp(input: MultiStepInput, state: State) {
		
		window.showInformationMessage(`Creating Application '${state.name}' for '${state.board.label}'`);

		await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/oi-template/src/CMakeLists.txt')), Uri.file(state.path + '/' + state.name + '/src/CMakeLists.txt'));

		// Read main.cpp, replace the contents, then write the file
		var data2 = fs.readFileSync(context.asAbsolutePath('/resources/oi-template/src/main.cpp'), 'utf8');
		data2 = data2.replace(/REPLACE_CLASS_HERE/g, state.board.label.substring(0,3).toUpperCase() + state.board.label.substring(3).split('_')[0].toLowerCase()); // Write the correct class name
		data2 = data2.replace(/REPLACE_NAME_HERE/g, state.board.label.substring(2).split('_')[0].toLowerCase()); // Write the correct class name
		fs.writeFileSync(state.path + '/' + state.name + '/src/main.cpp', data2, 'utf8');

		if (state.board.label === 'OICore') {
			await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/bin/app_flash_esp32.bin')), Uri.file(state.path + '/' + state.name + '/bin/app_flash_esp32.bin'));
			await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/oi-template/boards/oi-esp32.json')), Uri.file(state.path + '/' + state.name + '/boards/oi-esp32.json'));	
		} else {
			await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/bin/app_flash_esp32s2.bin')), Uri.file(state.path + '/' + state.name + '/bin/app_flash_esp32s2.bin'));
			await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/oi-template/boards/oi-esp32s2.json')), Uri.file(state.path + '/' + state.name + '/boards/oi-esp32s2.json'));	
		}
		await workspace.fs.copy(Uri.file(context.asAbsolutePath('/resources/oi-template/boards/partition.csv')), Uri.file(state.path + '/' + state.name + '/boards/partition.csv'));	
			
		// Read platformio.ini, replace the build flag and write the file to the folder
		var data  = fs.readFileSync(context.asAbsolutePath('/resources/oi-template/platformio.ini'), 'utf8');
		data = data.replace(/REPLACE_BOARD_HERE/g, state.board.label.toUpperCase().substring(2));
		if (state.board.label === 'OICore') {
			data = data.replace(/REPLACE_ESP_HERE/g, "oi-esp32");
		} else {
			data = data.replace(/REPLACE_ESP_HERE/g, "oi-esp32s2");
		}
		fs.writeFileSync(state.path + '/' + state.name + '/platformio.ini', data, 'utf8');

		// Read CMakeLists.txt, replace the project name, then write the file
		var data2 = fs.readFileSync(context.asAbsolutePath('/resources/oi-template/CMakeLists.txt'), 'utf8');
		data2 = data2.replace(/REPLACE_PROJECT_HERE/g, state.name);
		fs.writeFileSync(state.path + '/' + state.name + '/CMakeLists.txt', data2, 'utf8');

		await commands.executeCommand('vscode.openFolder', Uri.file(state.path + '/' + state.name));
	}

	function shouldResume() {
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {
			// noop
		});
	}

	async function validateNameIsUnique(path: string | undefined, name: string) {
        if (fs.existsSync(path + '/' + name)) {
            return "Folder already exits";
        } else if (name.indexOf(' ') >= 0) {
			return "Project could not contains white space";
		} else {
            return undefined;
        }
	}

	const state = await collectInputs();

    return state;
}


// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------


class InputFlowAction {
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters<T extends QuickPickItem> {
	title: string;
	step: number;
	totalSteps: number;
	items: T[];
	activeItem?: T;
	placeholder: string;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
	title: string;
	step: number;
	totalSteps: number;
	value: string;
	prompt: string;
	validate: (path: string | undefined, value: string) => Promise<string | undefined>;
	buttons?: QuickInputButton[];
    path: string | undefined;
	shouldResume: () => Thenable<boolean>;
}

class MultiStepInput {

	static async run<T>(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough<T>(start: InputStep) {
		let step: InputStep | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
	}

	async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createQuickPick<T>();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.placeholder = placeholder;
				input.items = items;
				if (activeItem) {
					input.activeItems = [activeItem];
				}
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidChangeSelection(items => resolve(items[0])),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, path, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createInputBox();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.value = value || '';
				input.prompt = prompt;
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				let validating = validate('', '');
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(async () => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						if (!(await validate(path, value))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
						const current = validate(path, text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}