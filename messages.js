'use strict';

module.exports.fbMessages = {

     signInButton : {
        type: 'account_link',
        url: 'A_L'
    },
    
      createAccountMessage : {
        attachment: {
            type: 'template',
            payload: {
                template_type: 'button',
                text: 'Welcome to GitHubUserBot! You’ll need to link your github’s account so I can access your repos!!',
                buttons: [this.signInButton],
            },
        },
    },
    
      sendGitHubRepoListMessage : {
        attachment: {
            type: 'template',
            payload: {
                template_type: 'generic',
                elements: [],
            },
        },
    },
    
      githubLinkedAccountMessageOptions : {
        attachment: {
            type: 'template',
            payload: {
                template_type: 'button',
                text: 'Your Account is now linked!!!',
                buttons: [{
                    type: 'postback',
                    payload: 'LIST_REPOS',
                    title: 'List repos'
                },
                {
                    type: 'postback',
                    payload: 'CREATE_REPO',
                    title: 'Create new repo'
                }],
            },
        },
    },
    
     confirmGitRepoCreationMessageOptions : {
        attachment: {
            type: 'template',
            payload: {
                template_type: 'button',
                text: '',
                buttons: [{
                    type: 'postback',
                    payload: '',
                    title: 'YES'
                },
                {
                    type: 'postback',
                    payload: 'DO_NOT_CREATE_REPO',
                    title: 'NO'
                }],
            },
        },
    }

}

 