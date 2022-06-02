import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as triggers from "aws-cdk-lib/triggers";
//import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class DemoDataStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const importedUserPoolId = cdk.Fn.importValue('userPoolId');

    // demo data to create cognito user pool (CUP) users and groups
    const userData = '[{"name":"user3","group":"engineering","password":"User2022!"},{"name":"user4","group":"marketing","password":"User2022!"}]';
    //const secret = new secretsmanager.Secret(this, 'Secret');
    //console.log(secret.secretValue);

    // trigger deployment of amplify hosted react app
    new triggers.TriggerFunction(cdk.Stack.of(this), "cdkTriggerDemoData", {
      environment: {
        userPoolId: importedUserPoolId,
        userData: userData,
      },
      code: lambda.Code.fromAsset("lambdas/cdk"),
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: "trigger_demo_data_ingestion.lambda_handler",
      timeout: cdk.Duration.seconds(30),
      executeOnHandlerChange: false,
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ["cognito-idp:AdminCreateUser","cognito-idp:AdminAddUserToGroup"],
          resources: [`${importedUserPoolArn}`],
        }),
      ],
    });

    new cdk.CfnOutput(this, "demoUserData", {
      value: userData,
    });

  }
}
