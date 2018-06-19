// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { MessageFactory, BotStateSet, BotFrameworkAdapter, MemoryStorage, ConversationState, UserState } = require('botbuilder');
const { LuisRecognizer, QnAMaker } = require('botbuilder-ai');
// const { CosmosDbStorage, TableStorage, BlobStorage } = require('botbuilder-azure');
const { DialogSet } = require('botbuilder-dialogs');
const restify = require('restify');


let server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log(`${server.name} listening to ${server.url}`);
});

const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});


//-----------------------------------------------
// LuisRecognizers & QnA
//-----------------------------------------------

const dispatcher = new LuisRecognizer({
    appId: 'c6e704f8-fc79-46d5-8035-a871692d8446',
    subscriptionKey: process.env.LuisSubscriptionKey,
    serviceEndpoint: 'https://westus.api.cognitive.microsoft.com',
    verbose: true
});

const homebotLuis = new LuisRecognizer({
    appId: '53caa4fb-4206-4060-8eb7-9bca97138618',
    subscriptionKey: process.env.LuisSubscriptionKey,
    serviceEndpoint: 'https://westus.api.cognitive.microsoft.com',
    verbose: true
});

const homebotQna = new QnAMaker({
    knowledgeBaseId: 'ff1a599c-9b79-41b7-b65a-32c477f6ba85',
    endpointKey: process.env.QnaEndpointKey,
    host: 'https://homebotqna.azurewebsites.net/qnamaker'
},{ answerBeforeNext: true });



//-----------------------------------------------
// Middleware
//-----------------------------------------------

// const storage = process.env.UseTableStorageForConversationState === 'true' ? new BlobStorage({ containerName: 'botstate', storageAccountOrConnectionString: process.env.AzureWebJobsStorage }) : new MemoryStorage();
const storage = new MemoryStorage();
const conversationState = new ConversationState(storage);
const userState = new UserState(storage);
adapter.use(new BotStateSet(conversationState, userState));



//-----------------------------------------------
// Dialogs
//-----------------------------------------------

const dialogs = new DialogSet();

const customDialogs = require("./dialogs");

dialogs.add('getUserInfo', new customDialogs.GetUserInfo(conversationState, userState));
dialogs.add('property_maintenance', new customDialogs.PropertyMaintenance(conversationState, userState));
dialogs.add('property_feedback', new customDialogs.PropertyFeedback(conversationState, userState));
dialogs.add('None', new customDialogs.NoneIntent(conversationState, userState));


server.post('/api/messages', (req, res) => {
    adapter.processActivity(req, res, async (context) => {
        
        var isMessage = false

        const uState = userState.get(context);
        const cState = conversationState.get(context);
        const dc = dialogs.createContext(context, cState);

        const activeFlow = cState.activeFlow === true;


        switch (context.activity.type) {
            case 'message':
                console.log('message');
                isMessage = true
                // Represents a communication between bot and user.
                if (!activeFlow) {

                    if (uState.userInfo === undefined) {

                        await dc.begin('getUserInfo');

                    } else {

                        // Retrieve the LUIS results from our dispatcher LUIS application
                        const dispatchLuisResults = await dispatcher.recognize(context);

                        // Extract the top intent from LUIS and use it to select which LUIS application to dispatch to
                        const topIntent = LuisRecognizer.topIntent(dispatchLuisResults);

                        switch (topIntent) {
                            case 'l_homebot':
                                const homebotLuisResults = await homebotLuis.recognize(context);
                                const topHomebotLuisIntent = LuisRecognizer.topIntent(homebotLuisResults);
                                await dc.begin(topHomebotLuisIntent, homebotLuisResults);
                                break;
                            case 'q_homebotqna':
                                await homebotQna.answer(context);
                                break;
                            default:
                                await dc.begin('None');
                        }
                    }
                }
                break;
            case 'contactRelationUpdate':
                // Indicates that the bot was added or removed from a user's contact list.
                console.log('contactRelationUpdate');
                break;
            case 'conversationUpdate':
                // Indicates that the bot was added to a conversation, other members were
                // added to or removed from the conversation, or conversation metadata has changed.
                console.log('conversationUpdate');
                if (!activeFlow && context.activity.membersAdded[0].name !== 'Bot') {
                    if (uState.userInfo === undefined) {
                        await dc.begin('getUserInfo');
                    } else {
                        await dc.context.sendActivity(`Welcome back ${uState.userInfo.userName}! Just a reminder, I can help with you with issues, feedback, and general information about your home.`);
                    }
                }
                break;
            case 'deleteUserData':
                // Indicates to a bot that a user has requested that the bot delete any user data it may have stored.
                console.log('deleteUserData');
                break;
            case 'endOfConversation':
                // Indicates the end of a conversation.
                console.log('endOfConversation');
                break;
            case 'event':
                // Represents a communication sent to a bot that is not visible to the user.
                console.log('event');
                break;
            case 'invoke':
                // Represents a communication sent to a bot to request that it perform a specific operation. 
                console.log('invoke');
                // This activity type is reserved for internal use by the Microsoft Bot Framework.
                break;
            case 'messageReaction':
                // Indicates that a user has reacted to an existing activity. 
                console.log('messageReaction');
                // For example, a user clicks the "Like" button on a message.
                break;
            case 'ping':
                // Represents an attempt to determine whether a bot's endpoint is accessible.
                console.log('ping');
                break;
            case 'typing':
                // Indicates that the user or bot on the other end of the conversation is compiling a response.
                console.log('typing');
                break;
        }

        if (!context.responded) {
            console.log('continue...');
            await dc.continue();
            if (!context.responded && isMessage) {
                await dc.context.sendActivity(`Howdy, I'm HomeBot! I can help with you with issues, feedback, and general information about your home.`);
            }
        }        
    });
});