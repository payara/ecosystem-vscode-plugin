'use strict';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *  https://github.com/microsoft/vscode-extension-samples/
 *--------------------------------------------------------------------------------------------*/

import { Disposable, QuickInput, QuickInputButton, QuickInputButtons, QuickPickItem, Uri, window } from 'vscode';


// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------
class InputFlowAction {
	private constructor() { }
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

export class MyButton implements QuickInputButton {
    constructor(public iconPath: { light: Uri; dark: Uri; }, public tooltip: string) { }
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
	validate: (value: string) => Promise<string | undefined>;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

export class MultiStepInput {

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

	public async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
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
				input.show();
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	public async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume }: P) {
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
				let validating = validate('');
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
						if (!(await validate(value))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
						const current = validate(text);
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
				input.show();
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}
