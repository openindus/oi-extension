import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar';
import { ModuleInfo, deviceTypeList, formatStringOItoEnvName, IS_WINDOWS, getClassNameFromEnv } from './utils';
import { logger } from './extension';

export async function createProject(context: vscode.ExtensionContext, master?: ModuleInfo, slaves?: ModuleInfo[]) {
    
    const boardsNames: vscode.QuickPickItem[] = deviceTypeList.map(label => ({ label }));
    const modeNames: vscode.QuickPickItem[] = [ 
        {label: 'Master', detail:'Choose "master" if the module you are programming on is used to control other modules'},
        {label: 'Standalone', detail: 'Choose "standalone" if the module you are programming on is use alone'},
        {label: 'Slave', detail: 'Choose "slave" if the module is controlled by a "master" module (not recommended)'}
    ];
    const useArduinoQuickPick: vscode.QuickPickItem[] = [
        {label: 'Use Arduino Library', detail: 'Recommended: Allow use of Arduino functions and libraries'},
        {label: 'Do Not Use Arduino Library', detail: 'Advanced users: ESP-IDF framework functions directly - faster project setup and shorter build times'}
    ];

	const optionsSelectFolder: vscode.OpenDialogOptions = {
		canSelectMany: false,
		openLabel: 'Select Folder',
		canSelectFiles: false,
		canSelectFolders: true,
		title: 'Select a root folder for your application'
	};

	interface State {
		board: vscode.QuickPickItem;
		name: string;
        path: string;
        mode: vscode.QuickPickItem;
        useArduinoLib: vscode.QuickPickItem;
	}

    let state = {} as Partial<State>;

    // First STEP: select board
    if (master !== undefined) {
        boardsNames.forEach((boardsName: vscode.QuickPickItem) => {
            if (boardsName.label === master.type) { // TODO check if master type need formatting
                state.board = boardsName;
            }
        });
    } else {
        state.board = await vscode.window.showQuickPick(boardsNames, {
            title: "Create a Project",
            placeHolder: "Select the name of the board you will program on",
            ignoreFocusOut: false
        });
    }

    if (state.board === undefined) { return; }

    // Second STEP: select folder
    state.path = await vscode.window.showOpenDialog(optionsSelectFolder).then(fileUri => {
        if (fileUri && fileUri[0]) {
            return fileUri[0].fsPath;
        }
        else {
            return undefined;
        }
    });
    
    if (state.path === undefined) { return; }

    // Third STEP: select project name
    state.name = await vscode.window.showInputBox({
        title: "Create a Project",
        value: "my_project",
        prompt: 'Enter a name for your project',
        ignoreFocusOut: true,
        validateInput: (text: string): string | undefined => {
            if (text !== path.basename(text)) { 
                return "Name is not valid";
            } else if (fs.existsSync(state.path + '/' + text) && text !== "") { // Check is folder already exists
                return "Folder already exits";
            } else if (text.indexOf(' ') >= 0) { // Check for white space
                return "Project name can not contains white space";
            } else if (text.indexOf('*') >= 0) { // Check for "*"
                return "Project name can not contains *";
            } else {
                return undefined;
            }
        }
    });
    
    if (state.name === undefined) { return; }

    // Fourth STEP: select project mode: master, standalone or slave
    if (master !== undefined) {
        state.mode = modeNames[0]; // If master infos are given; select "master" mode without asking
    } else {
        state.mode = await vscode.window.showQuickPick(modeNames, {
            title: "Choose your configuration",
            placeHolder: "Which configuration do you want to use ?",
            ignoreFocusOut: true // to prevent closing when clicking outside at this step
        });
    }

    if (state.mode === undefined) { return; }

    // Fifth STEP: select if use arduino library or not
    state.useArduinoLib = await vscode.window.showQuickPick(useArduinoQuickPick, {
        title: "Choose Library Option",
        placeHolder: "Do you want to use Arduino library in your project ?",
        ignoreFocusOut: true // to prevent closing when clicking outside at this step
    });

    if (state.useArduinoLib === undefined) { return; }

    // Sixth STEP: Create project with progress bar
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Creating project ${state.name}`,
        cancellable: false
    }, async () => {

        try {
            // Create src directory
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(state.path + '/' + state.name + '/src'));

            // Add default files to project
            await vscode.workspace.fs.copy(
                vscode.Uri.file(context.asAbsolutePath('/resources/project_files/sdkconfig.defaults')),
                vscode.Uri.file(state.path + '/' + state.name + 'sdkconfig.defaults')
            );
            await vscode.workspace.fs.copy(
                vscode.Uri.file(context.asAbsolutePath('/resources/project_files/CMakeLists.txt')),
                vscode.Uri.file(state.path + '/' + state.name + 'CMakeLists.txt')
            );

            let mainFolder = state.useArduinoLib.label === 'Use Arduino Library' ? 'main_arduino' : 'main_espidf';
            await vscode.workspace.fs.copy(
                vscode.Uri.file(context.asAbsolutePath('/resources/project_files/' + mainFolder + '/CMakeLists.txt')),
                vscode.Uri.file(state.path + '/' + state.name + '/main/CMakeLists.txt')
            );
            await vscode.workspace.fs.copy(
                vscode.Uri.file(context.asAbsolutePath('/resources/project_files/' + mainFolder + '/main.cpp')),
                vscode.Uri.file(state.path + '/' + state.name + '/main/main.cpp')
            );

            // Add modules instance to main.cpp
            let envName = formatStringOItoEnvName(state.board.label).replaceAll('lite', ''); // Todo find a better way to remove 'lite
            let className = getClassNameFromEnv(state.board.label);
            let mainSetupText: string = "%MODULE_INIT%";
            var mainInitText: string = "";
            
            // Master module init
            mainInitText += '\r\n// First, init the master device\r\n'; // empty line + master comment
            mainInitText += className + " " + envName + ";\r\n";  // master instance line
            mainInitText += "\r\// Then add slaves devices here :\r\n";
            // Slave modules init
            if (slaves !== undefined) {
                let i = 1;
                slaves.forEach((slave: ModuleInfo) => {
                    // /!\ OIStepperVE = OIStepper ? Really ??
                    mainInitText += getClassNameFromEnv(slave.type) + " " + formatStringOItoEnvName(slave.type) + String(i) + ";\r\n"; // slave instance line
                    i++;
                });
            } else {
                // Put examples in comment
                mainInitText += "// OIDiscrete discrete1;\r\n// OIDiscrete discrete2;\r\n// ...\r\n";
            }
            mainInitText += '\r\n'; // empty line
            // Replace text in main.cpp
            let mainFile = fs.readFileSync(state.path + '/' + state.name + '/main/main.cpp', 'utf8');
            mainFile = mainFile.replaceAll(mainSetupText, mainInitText);
            fs.writeFileSync(state.path + '/' + state.name + '/main/main.cpp', mainFile, 'utf8');
            
            // Create component directory
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(state.path + '/' + state.name + '/components'));
            
            // Extract OpenIndus component to project
            await tar.extract({
                file: context.asAbsolutePath('/resources/libraries/openindus-v2.0.0.tar.gz'),
                cwd: state.path + '/' + state.name + '/components/openindus/'
            });

            // Extract Arduino component to project if needed
            if (state.useArduinoLib.label === 'Use Arduino Library') {
                await tar.extract({
                    file: context.asAbsolutePath('/resources/libraries/arduino-v2.0.0.tar.gz'),
                    cwd: state.path + '/' + state.name + '/components/arduino/'
                });
            }
            
            // // Copy CMakeLists.txt and replace %VAR% by the user selection
            // await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/CMakeLists.txt')), vscode.Uri.file(state.path + '/' + state.name + '/CMakeLists.txt'));
            // let cmakelistsFile = fs.readFileSync(state.path + '/' + state.name + '/CMakeLists.txt', 'utf8');
            // cmakelistsFile = cmakelistsFile.replaceAll("%ENV%", envName);
            // cmakelistsFile = cmakelistsFile.replace("%PROJECT%", state.name!);
            // fs.writeFileSync(state.path + '/' + state.name + '/CMakeLists.txt', cmakelistsFile, 'utf8');

            // // Copy versionFile.txt and replace %LIB_VERSION%
            // await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/version.txt')), vscode.Uri.file(state.path + '/' + state.name + '/version.txt'));
            // let versionFile = fs.readFileSync(state.path + '/' + state.name + '/version.txt', 'utf8');
            // if (libVersionResults !== null) {
            //     versionFile = versionFile.replace("%LIB_VERSION%", libVersionResults[0]);
            // } else {
            //     versionFile = versionFile.replace("%LIB_VERSION%", "1.0.0");
            // }
            // fs.writeFileSync(state.path + '/' + state.name + '/version.txt', versionFile, 'utf8');

            // // Copy platformio.ini and replace %VAR% by the user selection
            // await vscode.workspace.fs.copy(vscode.Uri.file(context.asAbsolutePath('/resources/project_files/platformio.ini')), vscode.Uri.file(state.path + '/' + state.name + '/platformio.ini'));
            // let pioFile = fs.readFileSync(state.path + '/' + state.name + '/platformio.ini', 'utf8');
            // pioFile = pioFile.replaceAll("%ENV%", envName);
            // pioFile = pioFile.replace("%LIB_VERSION%", libVersion);
            // pioFile = pioFile.replace("%MODULE%", envName.toUpperCase());
            // pioFile = pioFile.replace("%MODE%", state.mode.label.toUpperCase());
            // if (IS_WINDOWS === false) {
            //     pioFile = pioFile.replace("monitor_rts = 1", "monitor_rts = 0");
            //     pioFile = pioFile.replace("monitor_dtr = 1", "monitor_dtr = 0");
            // }
            // fs.writeFileSync(state.path + '/' + state.name + '/platformio.ini', pioFile, 'utf8');
        }
        catch (error) {
            logger.error("Error while creating project: " + error);
            vscode.window.showErrorMessage("Error while creating project: " + error);
        }
    });

    // Last STEP: Open folfer
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(state.path + '/' + state.name), { forceNewWindow: true });
}