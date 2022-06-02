import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as triggers from "aws-cdk-lib/triggers";

export class DemoDataStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const importedUserPoolId = cdk.Fn.importValue('userPoolId');
    const importedUserPoolArn = cdk.Fn.importValue('userPoolArn');


    const userGroup = "C1";

    // create Cognito User Pool (CUP) users
    const user1: Object = {
      name: 'user7',
      group: userGroup,
      password: (Math.random()+1).toString(36).substr(2,8),
    };

    const user2: Object = {
      name: 'user8',
      group: userGroup,
      password: (Math.random()+1).toString(36).substr(2,8),
    };

    const userData = JSON.stringify([user1,user2]);

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
