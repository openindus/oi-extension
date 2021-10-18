import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { deviceTypeList, pioProjects, sourceAddress, sourceRefAddress } from './utils';
import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";

export async function createProject(context: vscode.ExtensionContext) {
    
    const boardsNames: vscode.QuickPickItem[] = deviceTypeList.map(label => ({ label }));
	const yesNoList: string[] = ['yes', 'no'];
    const yesNoQuickPick: vscode.QuickPickItem[] = yesNoList.map(label => ({ label }));
    let firmwareVersions: vscode.QuickPickItem[] = [];
	const fileDownloader: FileDownloader = await getApi();

	const optionsSelectFolder: vscode.OpenDialogOptions = {
		canSelectMany: false,
		openLabel: 'Select Folder',
		canSelectFiles: false,
		canSelectFolders: true,
		title: 'Select a root folder for your application'
	};

	interface State {
		title: string;
		board: vscode.QuickPickItem;
		name: string;
        path: string;
		version: vscode.QuickPickItem;
        firmwareDirectory: vscode.Uri;
	}

    let state = {} as Partial<State>;

    // First STEP: select board
    state.board = await vscode.window.showQuickPick(boardsNames, {
        title: "Create a Project",
        placeHolder: "Select the name of the board you will program on"
    });

    if (state.board === undefined) { return; }

    // Second STEP: select folder
    const customPath = await vscode.window.showQuickPick(yesNoQuickPick, {
        title: "Create a Project",
        placeHolder: "Do you want to use default location ?"
    });

    if (customPath?.label === "no") {
        state.path = await vscode.window.showOpenDialog(optionsSelectFolder).then(fileUri => {
            if (fileUri && fileUri[0]) {
                return fileUri[0].fsPath;
            }
            else {
                return undefined;
            }
        });
    }
    else {
        state.path = pioProjects;
    }
    
    if (state.path === undefined) { return; }

    // Third STEP: select project name
    state.name = await vscode.window.showInputBox({
        title: "Create a Project",
        prompt: 'Enter a name for your project',
        validateInput: (text: string): string | undefined => {
            if (fs.existsSync(state.path + '/' + text) && text !== "") { // Check is folder already exists
                return "Folder already exits";
            } else if (text.indexOf(' ') >= 0) { // Check for white space
                return "Project could not contains white space";
            } else {
                return undefined;
            }
        }
    });
    
    if (state.name === undefined) { return; }

    // Fourth STEP:  Get list of versions available by checking the html page and choose one
    const fileListAsHtml = await fileDownloader.downloadFile(
        vscode.Uri.parse(sourceRefAddress),
        "fileListAsHtml",
        context,
        undefined,
        undefined
    );

    if (fileListAsHtml !== undefined) {

        fs.readFileSync(fileListAsHtml.fsPath, 'utf8').match(/\d+.\d+.\d+.zip/g)?.forEach(function(line) {
            firmwareVersions.unshift({label: line.split('.zip')[0]});
        });

        if (firmwareVersions.length === 0) {
            vscode.window.showErrorMessage("Cannot retrieve firmware version, please check your internet connection !");
            return;
        }

        firmwareVersions[0].description = "latest";

        await fileDownloader.deleteItem("fileListAsHtml", context);
    }
    else {
        vscode.window.showErrorMessage("Cannot retrieve firmware version, please check your internet connection !");
        // TODO: check local files instead how returning an error
        return;
    }

    state.version = await vscode.window.showQuickPick(firmwareVersions, {
        title: "Create a Project",
        placeHolder: "Select the version of the firmware (we highly recommend to use the latest version)",
    });

    if (state.version === undefined) { return; }

    // Last STEP: Create the application
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Creating Application '${state.name}' for ${state.board.label}`,
        cancellable: true
    }, async (progress, cancellationToken) => {

        let counter = 0;

        const progressCallback = (downloadedBytes: number, totalBytes: number | undefined) => {
            // This is not working rigth now, check back later if API has improved
            if (counter === 0) {
                progress.report({ message: `Downloading.` });
            }
            if (counter === 1) {
                progress.report({ message: `Downloading..` });
            }
            if (counter === 2) {
                progress.report({ message: `Downloading...` });
            }
            counter++;
            if (counter === 3) {
                counter = 0;
            }
        };

        if (state.version === undefined) { return; }

        let firmware = await fileDownloader.tryGetItem("oi-firmware-" + state.version.label, context);
        
        if (firmware === undefined) {
            vscode.window.showInformationMessage("Please wait while your application is downloading, it can takes several minutes...");
            firmware = await fileDownloader.downloadFile(
                vscode.Uri.parse(sourceAddress + state.version.label + ".zip"),
                "oi-firmware-" + state.version.label,
                context,
                cancellationToken,
                progressCallback,
                { shouldUnzip: true }
            );
        }

        state.firmwareDirectory = vscode.Uri.file(firmware.fsPath + "/oi-firmware-" + state.version.label + "/"); // firmware is in a subfolder  

        let arduino = await fileDownloader.tryGetItem("arduino-2.0.0", context);
        
        if (arduino === undefined) {
            firmware = await fileDownloader.downloadFile(
                vscode.Uri.parse("https://github.com/espressif/arduino-esp32/releases/download/2.0.0/esp32-2.0.0.zip"),
                "arduino-2.0.0",
                context,
                cancellationToken,
                progressCallback,
                { shouldUnzip: true }
            );
        }

        if (state.board === undefined || arduino === undefined) { return; }

        // Replace default_envs by the user selection
        var data  = fs.readFileSync(state.firmwareDirectory.fsPath + 'platformio.ini', 'utf8');
		data = data.replace("default_envs = core", "default_envs = " + state.board.label.toLowerCase().substring(2));
		fs.writeFileSync(state.firmwareDirectory.fsPath +  'platformio.ini', data, 'utf8');

        // Copy source
        await vscode.workspace.fs.copy(state.firmwareDirectory, vscode.Uri.file(state.path + '/' + state.name + '/'));
        // Add Arduino
        await vscode.workspace.fs.copy(vscode.Uri.file(arduino.fsPath + '/esp32-2.0.0/'), vscode.Uri.file(state.path + '/' + state.name + '/libraries/Arduino/'), { overwrite: true});
        // Open workspace
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(state.path + '/' + state.name));
    });
}