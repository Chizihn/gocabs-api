import { Resolver, Mutation, Authorized, Arg, Ctx } from "type-graphql";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import { GraphQLError } from "graphql";
import {
  CreateSignedUrlInput,
  SignedUrlResponse,
} from "../types/graphql/Upload";
import { Context } from "../types/Context";

@Resolver()
export class UploadResolver {
  @Authorized() // Protects the endpoint for all logged-in users
  @Mutation(() => SignedUrlResponse)
  async createSignedUploadUrl(
    @Arg("input") { filename, contentType }: CreateSignedUrlInput,
    @Ctx() { userId }: Context
  ): Promise<SignedUrlResponse> {
    if (!userId) {
      throw new GraphQLError("User not authenticated.");
    }

    // Assumes Firebase Admin SDK is initialized on server start
    const bucket = getStorage().bucket(); // Uses default bucket

    // Create a unique, structured file path
    const extension = filename.split(".").pop() || "jpg";
    const uniqueFilename = `${uuidv4()}.${extension}`;
    const filePath = `uploads/${userId}/${uniqueFilename}`;

    const file = bucket.file(filePath);

    const options = {
      version: "v4" as const,
      action: "write" as const,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      contentType: contentType,
    };

    try {
      const [signedUrl] = await file.getSignedUrl(options);

      // This is the final, publicly accessible URL after the upload is complete
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      return {
        signedUrl,
        publicUrl,
      };
    } catch (error) {
      console.error("Error creating signed URL:", error);
      throw new GraphQLError("Could not create upload URL.");
    }
  }
}
