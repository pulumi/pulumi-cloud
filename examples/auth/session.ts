// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

let sessionStorage = new cloud.Table("sessions");

export interface Request extends cloud.Request {
    session: any;
    sessionId: string;
}

export async function session(req: cloud.Request, res: cloud.Response, next: () => void): Promise<void> {
    let session = (req as Request).session;
    throw new Error("not yet implemented");   
}

