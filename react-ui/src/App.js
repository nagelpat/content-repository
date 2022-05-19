import React from 'react';
import './App.css';
import Amplify from 'aws-amplify';
import { AmplifyAuthenticator, AmplifySignOut } from '@aws-amplify/ui-react';
import { AuthState, onAuthUIStateChange } from '@aws-amplify/ui-components';
import Homepage from './components/homepage';

// import and set the Amplify Auth backend configuration
let cdkExport = require('./amplify_auth_config.json');
const CDKConfig = {
  aws_project_region: cdkExport.BlogseriesStack.region,
  aws_cognito_identity_pool_id: cdkExport.BlogseriesStack.identityPoolId,
  aws_cognito_region: cdkExport.BlogseriesStack.region,
  aws_user_pools_id: cdkExport.BlogseriesStack.userPoolId,
  aws_user_pools_web_client_id: cdkExport.BlogseriesStack.userPoolClientId
};
Amplify.configure(CDKConfig);

const AuthStateApp = () => {
  const [authState, setAuthState] = React.useState();
  const [user, setUser] = React.useState();

  React.useEffect(() => {
    return onAuthUIStateChange((nextAuthState, authData) => {
      setAuthState(nextAuthState);
      setUser(authData);
    });
  },
    []);

  return authState === AuthState.SignedIn && user ? (
    <div className="container">
      <div id='logout'><AmplifySignOut /></div>
      <div id='homepage' ><Homepage /></div>
    </div>
  ) : (
    <AmplifyAuthenticator />
  );
};

export default AuthStateApp;
