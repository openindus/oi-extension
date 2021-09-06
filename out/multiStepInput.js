"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.multiStepInput = void 0;
const vscode_1 = require("vscode");
const fs = require("fs");
const deviceTypeList_1 = require("./deviceTypeList");
/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 *
 * This first part uses the helper class `MultiStepInput` that wraps the API for the multi-step case.
 */
function multiStepInput(context) {
    return __awaiter(this, void 0, void 0, function* () {
        const boardsNames = deviceTypeList_1.deviceTypeList.map(label => ({ label }));
        const options = {
            canSelectMany: false,
            openLabel: 'Select Folder',
            canSelectFiles: false,
            canSelectFolders: true,
            title: 'Select a root folder for your application'
        };
        function collectInputs() {
            return __awaiter(this, void 0, void 0, function* () {
                const state = {};
                yield MultiStepInput.run(input => pickFolder(input, state));
                return state;
            });
        }
        const title = 'Create a Template Application';
        function pickFolder(input, state) {
            return __awaiter(this, void 0, void 0, function* () {
                state.path = yield vscode_1.window.showOpenDialog(options).then(fileUri => {
                    if (fileUri && fileUri[0]) {
                        return fileUri[0].fsPath;
                    }
                    else {
                        throw InputFlowAction.cancel;
                    }
                });
                return (input) => pickBoard(input, state);
            });
        }
        function pickBoard(input, state) {
            return __awaiter(this, void 0, void 0, function* () {
                state.board = yield input.showQuickPick({
                    title,
                    step: 2,
                    totalSteps: 3,
                    placeholder: 'Choose a board',
                    items: boardsNames,
                    activeItem: typeof state.board !== 'string' ? state.board : boardsNames[0],
                    shouldResume: shouldResume
                });
                return (input) => inputName(input, state);
            });
        }
        function inputName(input, state) {
            return __awaiter(this, void 0, void 0, function* () {
                state.name = yield input.showInputBox({
                    title,
                    step: 3,
                    totalSteps: 3,
                    value: state.name || '',
                    prompt: 'Choose a name for your application',
                    validate: validateNameIsUnique,
                    path: state.path,
                    shouldResume: shouldResume
                });
                return (input) => createApp(input, state);
            });
        }
        function createApp(input, state) {
            return __awaiter(this, void 0, void 0, function* () {
                vscode_1.window.showInformationMessage(`Creating Application '${state.name}' for '${state.board.label}'`);
                yield vscode_1.workspace.fs.copy(vscode_1.Uri.file(context.asAbsolutePath('/resources/oi-template/.gitignore')), vscode_1.Uri.file(state.path + '/' + state.name + '/.gitignore'));
                yield vscode_1.workspace.fs.copy(vscode_1.Uri.file(context.asAbsolutePath('/resources/oi-template/CMakeLists.txt')), vscode_1.Uri.file(state.path + '/' + state.name + '/.CMakeLists.txt'));
                yield vscode_1.workspace.fs.copy(vscode_1.Uri.file(context.asAbsolutePath('/resources/oi-template/README.md')), vscode_1.Uri.file(state.path + '/' + state.name + '/.README.md'));
                yield vscode_1.workspace.fs.copy(vscode_1.Uri.file(context.asAbsolutePath('/resources/oi-template/sdkconfig.defaults')), vscode_1.Uri.file(state.path + '/' + state.name + '/.sdkconfig.defaults'));
                const platformioIniName = vscode_1.Uri.file(context.asAbsolutePath('/resources/oi-template/') + 'platformio_' + state.board.label.toLowerCase() + '.ini');
                yield vscode_1.workspace.fs.copy(platformioIniName, vscode_1.Uri.file(state.path + '/' + state.name + '/platformio.ini'));
                yield vscode_1.workspace.fs.copy(vscode_1.Uri.file(context.asAbsolutePath('/resources/oi-template/main')), vscode_1.Uri.file(state.path + '/' + state.name + '/main/'));
                yield vscode_1.workspace.fs.copy(vscode_1.Uri.file(context.asAbsolutePath('/resources/oi-template/bin')), vscode_1.Uri.file(state.path + '/' + state.name + '/bin/'));
                yield vscode_1.workspace.fs.copy(vscode_1.Uri.file(context.asAbsolutePath('/resources/oi-template/components/OpenIndus/')), vscode_1.Uri.file(state.path + '/' + state.name + '/components/OpenIndus/'));
                vscode_1.commands.executeCommand('vscode.openFolder', vscode_1.Uri.file(state.path + '/' + state.name));
            });
        }
        function shouldResume() {
            // Could show a notification with the option to resume.
            return new Promise((resolve, reject) => {
                // noop
            });
        }
        function validateNameIsUnique(path, name) {
            return __awaiter(this, void 0, void 0, function* () {
                if (fs.existsSync(path + '/' + name)) {
                    return "Folder already exits";
                }
                else {
                    return undefined;
                }
            });
        }
        const state = yield collectInputs();
        return state;
    });
}
exports.multiStepInput = multiStepInput;
// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------
class InputFlowAction {
}
InputFlowAction.back = new InputFlowAction();
InputFlowAction.cancel = new InputFlowAction();
InputFlowAction.resume = new InputFlowAction();
class MultiStepInput {
    constructor() {
        this.steps = [];
    }
    static run(start) {
        return __awaiter(this, void 0, void 0, function* () {
            const input = new MultiStepInput();
            return input.stepThrough(start);
        });
    }
    stepThrough(start) {
        return __awaiter(this, void 0, void 0, function* () {
            let step = start;
            while (step) {
                this.steps.push(step);
                if (this.current) {
                    this.current.enabled = false;
                    this.current.busy = true;
                }
                try {
                    step = yield step(this);
                }
                catch (err) {
                    if (err === InputFlowAction.back) {
                        this.steps.pop();
                        step = this.steps.pop();
                    }
                    else if (err === InputFlowAction.resume) {
                        step = this.steps.pop();
                    }
                    else if (err === InputFlowAction.cancel) {
                        step = undefined;
                    }
                    else {
                        throw err;
                    }
                }
            }
            if (this.current) {
                this.current.dispose();
            }
        });
    }
    showQuickPick({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }) {
        return __awaiter(this, void 0, void 0, function* () {
            const disposables = [];
            try {
                return yield new Promise((resolve, reject) => {
                    const input = vscode_1.window.createQuickPick();
                    input.title = title;
                    input.step = step;
                    input.totalSteps = totalSteps;
                    input.placeholder = placeholder;
                    input.items = items;
                    if (activeItem) {
                        input.activeItems = [activeItem];
                    }
                    input.buttons = [
                        ...(this.steps.length > 1 ? [vscode_1.QuickInputButtons.Back] : []),
                        ...(buttons || [])
                    ];
                    disposables.push(input.onDidTriggerButton(item => {
                        if (item === vscode_1.QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        }
                        else {
                            resolve(item);
                        }
                    }), input.onDidChangeSelection(items => resolve(items[0])), input.onDidHide(() => {
                        (() => __awaiter(this, void 0, void 0, function* () {
                            reject(shouldResume && (yield shouldResume()) ? InputFlowAction.resume : InputFlowAction.cancel);
                        }))()
                            .catch(reject);
                    }));
                    if (this.current) {
                        this.current.dispose();
                    }
                    this.current = input;
                    this.current.show();
                });
            }
            finally {
                disposables.forEach(d => d.dispose());
            }
        });
    }
    showInputBox({ title, step, totalSteps, value, prompt, validate, buttons, path, shouldResume }) {
        return __awaiter(this, void 0, void 0, function* () {
            const disposables = [];
            try {
                return yield new Promise((resolve, reject) => {
                    const input = vscode_1.window.createInputBox();
                    input.title = title;
                    input.step = step;
                    input.totalSteps = totalSteps;
                    input.value = value || '';
                    input.prompt = prompt;
                    input.buttons = [
                        ...(this.steps.length > 1 ? [vscode_1.QuickInputButtons.Back] : []),
                        ...(buttons || [])
                    ];
                    let validating = validate('', '');
                    disposables.push(input.onDidTriggerButton(item => {
                        if (item === vscode_1.QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        }
                        else {
                            resolve(item);
                        }
                    }), input.onDidAccept(() => __awaiter(this, void 0, void 0, function* () {
                        const value = input.value;
                        input.enabled = false;
                        input.busy = true;
                        if (!(yield validate(path, value))) {
                            resolve(value);
                        }
                        input.enabled = true;
                        input.busy = false;
                    })), input.onDidChangeValue((text) => __awaiter(this, void 0, void 0, function* () {
                        const current = validate(path, text);
                        validating = current;
                        const validationMessage = yield current;
                        if (current === validating) {
                            input.validationMessage = validationMessage;
                        }
                    })), input.onDidHide(() => {
                        (() => __awaiter(this, void 0, void 0, function* () {
                            reject(shouldResume && (yield shouldResume()) ? InputFlowAction.resume : InputFlowAction.cancel);
                        }))()
                            .catch(reject);
                    }));
                    if (this.current) {
                        this.current.dispose();
                    }
                    this.current = input;
                    this.current.show();
                });
            }
            finally {
                disposables.forEach(d => d.dispose());
            }
        });
    }
}
//# sourceMappingURL=multiStepInput.js.map