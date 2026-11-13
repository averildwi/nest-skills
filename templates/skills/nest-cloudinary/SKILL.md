---
name: nest-cloudinary
description: Use when a feature uploads, stores, replaces or deletes files (images or documents) through Cloudinary in a NestJS project.
---

## When to use

- Adding a file-upload endpoint (avatar, banner, thumbnail, attachment, proof).
- Storing, replacing or deleting a media asset.
- Adding `CLOUDINARY_URL` to the environment.

## The scaffold

`src/common/upload/` comes from `@averildwi/nest-cloudinary`. Treat it as the
standard and do not hand-write a parallel client.

- `UploadModule` is `@Global()` — inject `UploadService` anywhere; never re-import it.
- `UploadService.uploadFile(file, { folder, kind })` returns
  `{ url, publicId, resourceType, width, height, format, bytes }`.
- `UploadService.deleteFile(publicId, resourceType)` throws on failure;
  `UploadService.deleteByUrl(url)` is best-effort (logs, never throws) and parses
  the public id and resource type out of a stored URL.
- `FilePipe` (`src/common/upload/pipes/file.pipe.ts`) validates size, declared
  MIME, real content (magic bytes) and SVG safety.

If `src/common/upload/` is missing, tell the user to run
`npx @averildwi/nest-cloudinary` instead of writing the module by hand.

## Rules

### Endpoint

1. Upload interceptors use memory storage (Nest's default): single file
   `@UseInterceptors(FileInterceptor('file'))` + `@UploadedFile(...)`; multiple
   `FilesInterceptor('files', MAX)` + `@UploadedFiles(...)`.
2. Validate every uploaded file with `FilePipe` and pass explicit limits, e.g.
   `new FilePipe({ maxSizeMb: 5, allowedMimes: [...], maxFiles: N })`. Never trust
   `file.mimetype` alone — `FilePipe` also checks the bytes.
3. Keep limits small per route (≈2 MB images, ≈10 MB documents) and declare them
   in Swagger: `@ApiConsumes('multipart/form-data')` + `@ApiBody({ schema: { type:
   'object', properties: { file: { type: 'string', format: 'binary' } } } })`.

### Service

4. Upload through `UploadService`; never call `cloudinary.*` from a feature.
5. `kind: 'image'` (default) for images, `kind: 'document'` for anything raw
   (PDFs). Deleting must use the same `resourceType`, otherwise Cloudinary never
   finds the asset.
6. Always pass a `folder` (`'users/avatars'`, `'projects/thumbnails'`,
   `'events/banners'`). Never upload to the account root.
7. Store `url` **and** `publicId` together in the model (`xxxUrl` +
   `xxxPublicId`). The URL is for clients; the public id is only for deleting.
8. Never return `publicId` (or a raw Cloudinary response) to a client. Use an
   explicit `select` that omits it.
9. Upload before the DB write; if the write fails, delete the just-uploaded asset
   (compensation). Never leave an orphaned asset.
10. Replace flow: upload the new file, update the row, then `deleteByUrl(oldUrl)`
    (best-effort; do it after the row is safe, never before).

### Environment

11. `CLOUDINARY_URL` is validated with Joi (`.uri().required()`) in the project env
    schema and listed in `.env.example`; it is read with `ConfigService`.

## Good example

```ts
// controller
@Post(':id/avatar')
@UseInterceptors(FileInterceptor('file'))
@ApiConsumes('multipart/form-data')
@ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
async uploadAvatar(
  @Param('id', ParseUUIDPipe) id: string,
  @UploadedFile(new FilePipe({ maxSizeMb: 2 })) file: Express.Multer.File,
) {
  await this.usersService.updateAvatar(id, file);
  return new MessageResponse(null, 'Avatar updated');
}
```

```ts
// service: upload the new asset, write the row, then clean up the old one
const result = await this.upload.uploadFile(file, { folder: 'users/avatars' });
await this.upload.deleteByUrl(current.avatarUrl);
return this.prisma.user.update({
  where: { id },
  data: { avatarUrl: result.url, avatarPublicId: result.publicId },
});
```

```prisma
model User {
  avatarUrl      String?
  avatarPublicId String?
}
```

## Bad example

```ts
// BAD: no FilePipe, the client-declared MIME is trusted, no folder, and the SDK
// is called directly instead of through UploadService.
@Post(':id/avatar')
@UseInterceptors(FileInterceptor('file'))
upload(@UploadedFile() file: Express.Multer.File) {
  return this.cloudinary.uploader.upload(file.path);
}

// BAD: publicId leaks to the client; the old asset is never removed.
return { ...user, avatarPublicId: result.publicId };

// BAD: a PDF deleted with the default resource_type 'image' is never removed.
await this.upload.deleteFile(pdfPublicId);

// BAD: no folder, so assets pile up in the account root.
await this.upload.uploadFile(file, {});
```

## Checklist before finishing

- [ ] Every upload goes through `FilePipe` with explicit `maxSizeMb` + `allowedMimes` (and `maxFiles` for multi-file).
- [ ] `kind: 'document'` for PDFs, and deletion uses the matching `resourceType`.
- [ ] Every upload passes a `folder`.
- [ ] `url` and `publicId` are both stored; `publicId` never leaves the API.
- [ ] A failed DB write deletes the just-uploaded asset; a replace deletes the old asset.
- [ ] `CLOUDINARY_URL` is in the Joi schema **and** `.env.example`.
