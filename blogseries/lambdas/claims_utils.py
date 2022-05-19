import boto3
from botocore.exceptions import ClientError

idp_client = boto3.client('cognito-idp')

def claims_evaluator(request_claims):
    try:
        # get the preferred cognito group of the user
        preferred_role_arn = request_claims['cognito:preferred_role']
        response_error = False
    except KeyError:
        response_error = True
        print("cognito preferred group has not been set. Same group precedence?")
        return response_error, None, None
        
    # get the cognito groups of the user
    cognito_user_groups = idp_client.admin_list_groups_for_user(
        Username=request_claims['cognito:username'], 
        UserPoolId=request_claims['iss'].split('/')[3]
    )
    
    # find the cognito group name based on the preferred role arn
    for cognito_user_group in cognito_user_groups['Groups']:
        if(cognito_user_group['RoleArn'] == preferred_role_arn):
            preferred_group_name = cognito_user_group['GroupName']
            break
    
    return response_error, preferred_role_arn, preferred_group_name