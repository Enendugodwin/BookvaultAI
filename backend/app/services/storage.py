from __future__ import annotations

import re
from pathlib import Path

from app.core.config import settings

_SAFE = re.compile(r"[^a-zA-Z0-9._/-]")


def safe_key(key: str) -> str:
    key = key.replace("\\", "/").lstrip("/")
    key = _SAFE.sub("_", key)
    if ".." in key.split("/"):
        raise ValueError("Invalid storage key.")
    return key


class LocalStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / safe_key(key)).resolve()
        if self.root not in path.parents and path != self.root:
            raise ValueError("Invalid storage key.")
        return path

    def save(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        try:
            self._path(key).unlink()
        except FileNotFoundError:
            pass

    def presigned_url(self, key: str, expires: int = 3600) -> str | None:
        return None


class S3Storage:
    def __init__(self) -> None:
        import boto3

        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region,
        )

    def save(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        extra = {}
        if settings.s3_server_side_encryption:
            extra["ServerSideEncryption"] = settings.s3_server_side_encryption
        self.client.put_object(
            Bucket=self.bucket, Key=safe_key(key), Body=data,
            ContentType=content_type, **extra,
        )

    def read(self, key: str) -> bytes:
        obj = self.client.get_object(Bucket=self.bucket, Key=safe_key(key))
        return obj["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=safe_key(key))

    def presigned_url(self, key: str, expires: int = 3600) -> str | None:
        return self.client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": safe_key(key)}, ExpiresIn=expires
        )


class VercelBlobStorage:
    """Private Vercel Blob storage for serverless deployments.

    The SDK authenticates with Vercel OIDC on a deployed project, or with
    ``BLOB_READ_WRITE_TOKEN`` for local development.
    """

    def __init__(self) -> None:
        from vercel.blob.sync import delete_blob, get_blob, put_blob

        self._put = put_blob
        self._get = get_blob
        self._delete = delete_blob

    def save(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        self._put(
            safe_key(key),
            data,
            access="private",
            content_type=content_type,
            add_random_suffix=False,
            allow_overwrite=True,
        )

    def read(self, key: str) -> bytes:
        return self._get(safe_key(key), access="private").body

    def delete(self, key: str) -> None:
        self._delete(safe_key(key))

    def presigned_url(self, key: str, expires: int = 3600) -> str | None:
        # Private blobs are downloaded through the API, which streams the bytes.
        return None


_storage = None


def get_storage():
    global _storage
    if _storage is None:
        if settings.storage_backend == "s3":
            _storage = S3Storage()
        elif settings.storage_backend == "vercel_blob":
            _storage = VercelBlobStorage()
        else:
            _storage = LocalStorage(settings.storage_local_dir)
    return _storage
