import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

// Import createProject after mocking VS Code methods
import { createProject } from '../createProject';
import { startLogger } from '../utils';

suite('Extension Test Suite', () => {
	
	test('Create project', async () => {
		// Mock the extension context for testing
		const mockContext = {
			extensionPath: 'C:/Users/aurelien.floutard/Documents/01-SOFT/oi-extension',
			extensionUri: vscode.Uri.file('C:/Users/aurelien.floutard/Documents/01-SOFT/oi-extension'),
			asAbsolutePath: (relativePath: string) => relativePath,
			// Add other required properties as needed
		} as unknown as vscode.ExtensionContext;

		// Create mock ModuleInfo directly without importing from utils
		const moduleInfo: any = {
			port: "",
			type: "core",
			serialNum: "",
			hardwareVar: "",
			versionSw: "",
			imgName: "",
			caseName: "",
		}
		
		const slaveInfo: any[] = [
			{ type: "discrete", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" },
			{ type: "mixed", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" },
			{ type: "stepper", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" },
			{ type: "relayhp", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" },
			{ type: "analogls", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" },
			{ type: "dc", port: "", serialNum: "", hardwareVar: "", versionSw: "", imgName: "", caseName: "" }
		]

		// Open tree view to launch extension
		// await vscode.commands.executeCommand('openindus-treeview.focus', mockContext);
		
		startLogger();

		// Test the function without UI interactions
		const ret = await createProject(mockContext, moduleInfo, slaveInfo, "C:/Users/aurelien.floutard/Documents/01-SOFT/oi-extension/tmp_test", "TestProject", true, true);
		console.log("createProject returned: " + ret);
		assert.strictEqual(ret, true);
	});
});
