// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { DialogContainer, TextPrompt, ConfirmPrompt } = require('botbuilder-dialogs');

// Helper function to retrieve specific entities from LUIS results
function findEntities(entityName, entityResults) {
    let entities = []
    if (entityName in entityResults) {
        entityResults[entityName].forEach(entity => {
            entities.push(entity);
        });
    }
    return entities.length > 0 ? entities : undefined;
}

async function userNameValidator(context, value) {
    if (value && /^[a-zA-Z ]{2,30}$/.test(value)) {
        return value;
    }
    await context.sendActivity(`To ensure uniqueness please provide a name (or nickname) between 2 and 30 characters long that only contains letters and spaces.`);
    return undefined;
}

async function unitNumberValidator(context, value) {
    if (value && /^[0-9A-Z]{2,6}$/.test(value.toUpperCase())) {
        return value.toUpperCase();
    }
    await context.sendActivity(`Unit numbers are between 2 and 6 characters long and only contain numbers and letters (no spaces).`);
    return undefined;
}


class GetUserInfo extends DialogContainer {
    constructor(conversationState, userState) {
        super('getUserInfo');

        this.dialogs.add('getUserInfo', [
            async (dc, args, next) => {

                conversationState.get(dc.context).activeFlow = true;

                dc.activeDialog.state.userInfo = {}; // Clears any previous data

                await dc.context.sendActivity(`Hello 👋 , I'm HomeBot!`);
                await dc.prompt('userNamePrompt', `What should I call you?`);
            },
            async (dc, userName) => {

                dc.activeDialog.state.userInfo.userName = userName;

                await dc.context.sendActivity(`Very nice to meet you ${userName}!`);
                await dc.prompt('unitNumberPrompt', `Which unit are you in?`);
            },
            async (dc, unitNumber) => {

                dc.activeDialog.state.userInfo.unitNumber = unitNumber;

                const uState = userState.get(dc.context);
                uState.userInfo = dc.activeDialog.state.userInfo;

                await dc.context.sendActivity(`Perfect.  That's all the information I need.`);
                await dc.context.sendActivity(`I'm here to help with reporting issues, taking feedback and/or complaints, and answering questions about your home and the property.`);
                conversationState.get(dc.context).activeFlow = false;

                await dc.end();
            }
        ]);
        this.dialogs.add('userNamePrompt', new TextPrompt(userNameValidator));
        this.dialogs.add('unitNumberPrompt', new TextPrompt(unitNumberValidator));
    }
}

exports.GetUserInfo = GetUserInfo;


class PropertyMaintenance extends DialogContainer {
    constructor(conversationState, userState) {
        super('property_maintenance');
        
        this.dialogs.add('property_maintenance', [
            async (dc, args, next) => {

                conversationState.get(dc.context).activeFlow = true;

                const appliances = findEntities('maintenance_appliance', args.entities);
                const issues = findEntities('maintenance_issue', args.entities);

                dc.activeDialog.state.maintenanceRequest = {}

                if (appliances && issues) {

                    dc.activeDialog.state.maintenanceRequest.appliance = appliances[0];
                    dc.activeDialog.state.maintenanceRequest.issue = issues[0];
                    dc.activeDialog.state.maintenanceRequest.confirming = true;

                    await dc.context.sendActivity(`Hello, I understand your ${appliances[0]} requires maintenance for an issue described as: '${issues[0]}'`);
                
                } else {
                    await dc.context.sendActivity(`Hello, I understand require maintenance?`);
                }
                await dc.prompt('confirmPrompt', 'Is this correct?');
            },
            async (dc, confimation) => {

                await dc.context.sendActivity(`Thanks for replying with: ${confimation}`)

                conversationState.get(dc.context).activeFlow = false;

                await dc.end()
            }
        ]);
        this.dialogs.add('confirmPrompt', new ConfirmPrompt());
    }
}

exports.PropertyMaintenance = PropertyMaintenance;


class PropertyFeedback extends DialogContainer {
    constructor(conversationState, userState) {
        super('property_feedback')
        
        this.dialogs.add('property_feedback', [
            async (dc, args) => {

                conversationState.get(dc.context).activeFlow = true;

                const appliances = findEntities('appliance::', args.entities);

                const cState = conversationState.get(dc.context);
                cState.propertyFeedback = cState.propertyFeedback ? cState.propertyFeedback + 1 : 1;
                await dc.context.sendActivity(`${state.propertyFeedback}: You reached the "property_feedback" dialog.`);
                if (appliances) {
                    await dc.context.sendActivity(`Found these "appliances" entities:\n${appliances.join(', ')}`);
                }

                conversationState.get(dc.context).activeFlow = false;

                await dc.end();
            }
        ]);
    }
}

exports.PropertyFeedback = PropertyFeedback;


class NoneIntent extends DialogContainer {
    constructor(conversationState, userState) {
        super('None')
        
        this.dialogs.add('None', [
            async (dc) => {
                conversationState.get(dc.context).activeFlow = true;
                const cState = conversationState.get(dc.context);
                cState.noneIntent = cState.noneIntent ? cState.noneIntent + 1 : 1;
                await dc.context.sendActivity(`${state.noneIntent}: You reached the "None" dialog.`);
                conversationState.get(dc.context).activeFlow = false;
                await dc.end();
            }
        ]);
    }
}

exports.NoneIntent = NoneIntent;