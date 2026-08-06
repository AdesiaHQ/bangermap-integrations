import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  Icon,
  INodeProperties,
} from "n8n-workflow";

export class BangermapApi implements ICredentialType {
  name = "bangermapApi";

  displayName = "Bangermap YouTube Data API";

  icon: Icon = { light: "file:bangermap.svg", dark: "file:bangermap.dark.svg" };

  documentationUrl = "https://bangermap.com/tools/outlier-finder";

  properties: INodeProperties[] = [
    {
      displayName: "YouTube Data API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description:
        "Your own key from the Google Cloud console, with YouTube Data API v3 enabled on its project. Requests go from this n8n instance straight to googleapis.com, so nothing is metered and no Bangermap account is involved.",
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      qs: { key: "={{$credentials.apiKey}}" },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: "https://www.googleapis.com/youtube/v3",
      url: "/channels",
      qs: { part: "id", id: "UC_x5XG1OV2P6uZZ5FSM9Ttw" },
    },
  };
}
