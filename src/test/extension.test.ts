import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { createProject } from '../createProject';

suite('Extension Test Suite', () => {
	
	vscode.window.showInformationMessage('Start create project test');

	test('Create project', () => {
		// createProject()
		assert.strictEqual([1, 2, 3].indexOf(5), -1);
		assert.strictEqual([1, 2, 3].indexOf(0), -1);
	});
});