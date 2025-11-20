import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Import createProject after mocking VS Code methods
import { createProject } from '../createProject';
import { ModuleInfo, startLogger, downloadNewFirmwaresOnline, downloadNewLibrariesOnline } from '../utils';

suite('Extension Test Suite', () => {
	
	test('Create project', async function() {
		// Increase timeout for project creation test
		this.timeout(30000);

		// Mock the extension context for testing
		const extensionRoot = __dirname.replace(/\\/g, '/').replace(/\/test\/?$/, '').replace(/\/out\/?$/, '');
		console.log('Extension Root:', extensionRoot);
		const mockContext = {
			extensionPath: extensionRoot,
			extensionUri: vscode.Uri.file(extensionRoot),
			globalStorageUri: vscode.Uri.file(extensionRoot),
			asAbsolutePath: (relativePath: string) => {
				return `${extensionRoot}/${relativePath}`;
			},
			extensionMode: vscode.ExtensionMode.Test
		} as unknown as vscode.ExtensionContext;

		
		// Activate logger in test mode
		startLogger(mockContext);

		// Download the latets firmware from openindus server at each launch of application
		await downloadNewFirmwaresOnline(mockContext);
		await downloadNewLibrariesOnline(mockContext);

		// Clean up from previous test runs
		const testProjectPath = path.join(extensionRoot, 'tmp_test', 'TestProject');
		if (fs.existsSync(testProjectPath)) {
			fs.rmSync(testProjectPath, { recursive: true, force: true });
		}

		// Create mock ModuleInfo directly without importing from utils
		const moduleInfo: ModuleInfo = {
			port: "",
			type: "core",
			serialNum: "",
			hardwareVar: "",
			versionSw: "",
			imgName: "",
			caseName: "",
		};
		
		const slaveInfo: ModuleInfo[] = [
			{ type: "discrete", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" },
			{ type: "mixed", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" },
			{ type: "stepper", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" },
			{ type: "relayhp", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" },
			{ type: "analogls", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" },
			{ type: "dc", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" }
		];

		// Test the function without UI interactions
		const ret = await createProject(mockContext, moduleInfo, slaveInfo, path.join(extensionRoot, 'tmp_test'), "TestProject", true, true);
		assert(ret, "Create project failed");
	});
});
