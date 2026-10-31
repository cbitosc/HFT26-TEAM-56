-- Résumé uploads are capped at 5 MB (was 10 MB). The API enforces the same
-- limit; this keeps direct storage uploads consistent with it.
update storage.buckets
set file_size_limit = 5242880
where id = 'resumes';
