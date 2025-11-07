from flask import Blueprint, jsonify, request, current_app, send_from_directory, send_file, after_this_request
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from app.models import File, UserFilePermission
from app import db
import os
import shutil
import tempfile
import zipfile

bp = Blueprint('files', __name__)


def _build_permission_cache():
    permissions = UserFilePermission.query.filter_by(user_id=current_user.id).all()
    return {permission.file_id: permission for permission in permissions}


def _has_access(file_obj, permissions, require_write=False):
    if current_user.is_admin():
        return True

    if file_obj.owner_id == current_user.id:
        return True

    node = file_obj
    while node is not None:
        permission = permissions.get(node.id)
        if permission:
            if require_write:
                if permission.can_write:
                    return True
            else:
                if permission.can_read or permission.can_write:
                    return True
        node = node.parent

    return False


def _resolve_disk_path(owner_id, folder=None):
    base_path = os.path.join(current_app.config['UPLOAD_FOLDER'], f'user_{owner_id}')
    if folder is None:
        return base_path

    segments = []
    node = folder
    while node is not None:
        segments.append(node.filename)
        node = node.parent

    if segments:
        base_path = os.path.join(base_path, *reversed(segments))

    return base_path


def _sanitize_folder_name(name):
    if not name:
        return ''
    cleaned = name.strip()
    if not cleaned or cleaned in {'.', '..'}:
        return ''
    if '/' in cleaned or '\\' in cleaned:
        return ''
    return cleaned


def _delete_file_tree(file_obj):
    """Remove registros e arquivos físicos associados a um File."""
    if file_obj.is_folder:
        children = list(file_obj.children)
        for child in children:
            _delete_file_tree(child)
            db.session.delete(child)
        folder_path = _resolve_disk_path(file_obj.owner_id, file_obj)
        if os.path.isdir(folder_path):
            shutil.rmtree(folder_path, ignore_errors=True)
    else:
        file_path = os.path.join(_resolve_disk_path(file_obj.owner_id, file_obj.parent), file_obj.filename)
        try:
            os.remove(file_path)
        except FileNotFoundError:
            pass


@bp.route('/files', methods=['GET'])
@login_required
def list_files():
    parent_id = request.args.get('parent_id', default=None, type=int)
    sort_by = request.args.get('sort_by', default='name', type=str)
    permissions = _build_permission_cache()

    if parent_id is not None:
        parent = File.query.get_or_404(parent_id)
        if not parent.is_folder:
            return jsonify({'error': 'Invalid folder'}), 400
        if not _has_access(parent, permissions):
            return jsonify({'error': 'Permission denied'}), 403
        items = File.query.filter_by(parent_id=parent_id).all()
    else:
        if current_user.is_admin():
            items = File.query.filter_by(parent_id=None).all()
        else:
            candidates = File.query.filter_by(parent_id=None).all()
            items = []
            for file_obj in candidates:
                if file_obj.owner_id == current_user.id or _has_access(file_obj, permissions):
                    items.append(file_obj)

    def _sort_key(file_obj):
        folder_key = 0 if file_obj.is_folder else 1
        if sort_by == 'date':
            return (folder_key, -file_obj.created_at.timestamp())
        return (folder_key, file_obj.filename.lower())

    items.sort(key=_sort_key)

    return jsonify([item.to_dict() for item in items])

@bp.route('/files/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    raw_parent = request.form.get('parent_id')
    parent_id = None
    if raw_parent not in (None, '', 'null'):
        try:
            parent_id = int(raw_parent)
        except ValueError:
            return jsonify({'error': 'Invalid parent id'}), 400

    relative_path = request.form.get('relative_path')
    permissions = _build_permission_cache()

    target_folder = None
    storage_owner_id = current_user.id

    try:
        current_app.logger.info(
            'Uploading file "%s" (size=%s) parent_id=%s relative_path=%s user=%s',
            file.filename,
            getattr(file, 'content_length', None) or getattr(file, 'content_length', None),
            parent_id,
            relative_path,
            current_user.id
        )

        if parent_id is not None:
            target_folder = File.query.get_or_404(parent_id)
            if not target_folder.is_folder:
                return jsonify({'error': 'Invalid destination'}), 400
            if not _has_access(target_folder, permissions, require_write=True):
                return jsonify({'error': 'Permission denied'}), 403
            storage_owner_id = target_folder.owner_id

        filename = secure_filename(file.filename)
        destination_path = _resolve_disk_path(storage_owner_id, target_folder)

        if relative_path:
            path_parts = [part for part in relative_path.split('/') if part]
            if len(path_parts) > 1:
                current_parent_id = parent_id
                for raw_part in path_parts[:-1]:
                    part = _sanitize_folder_name(raw_part)
                    if not part:
                        continue
                    folder = File.query.filter_by(
                        owner_id=storage_owner_id,
                        parent_id=current_parent_id,
                        filename=part,
                        is_folder=True
                    ).first()
                    if not folder:
                        folder = File(
                            filename=part,
                            owner_id=storage_owner_id,
                            parent_id=current_parent_id,
                            is_folder=True
                        )
                        db.session.add(folder)
                        db.session.commit()
                    current_parent_id = folder.id
                    destination_path = os.path.join(destination_path, part)
                parent_id = current_parent_id

        os.makedirs(destination_path, exist_ok=True)
        file_path = os.path.join(destination_path, filename)
        temp_file_path = file_path + '.uploading'
        file.save(temp_file_path)
        os.replace(temp_file_path, file_path)

        new_file = File(
            filename=filename,
            owner_id=storage_owner_id,
            parent_id=parent_id,
            is_folder=False
        )
        db.session.add(new_file)
        db.session.commit()
        current_app.logger.info('Upload completed: "%s" id=%s user=%s', filename, new_file.id, current_user.id)
        return jsonify(new_file.to_dict()), 201
    except Exception as exc:
        current_app.logger.exception('Upload failed for "%s": %s', file.filename, exc)
        db.session.rollback()
        return jsonify({'error': 'File upload failed'}), 500


@bp.route('/files/<int:file_id>', methods=['DELETE'])
@login_required
def delete_file(file_id):
    permissions = _build_permission_cache()
    file_obj = File.query.get_or_404(file_id)

    if not _has_access(file_obj, permissions, require_write=True):
        return jsonify({'error': 'Permission denied'}), 403

    try:
        current_app.logger.info(
            'Deleting file "%s" (id=%s, folder=%s) requested by user=%s',
            file_obj.filename,
            file_obj.id,
            file_obj.is_folder,
            current_user.id
        )
        _delete_file_tree(file_obj)
        db.session.delete(file_obj)
        db.session.commit()
        return jsonify({'status': 'deleted', 'id': file_id})
    except Exception as exc:
        current_app.logger.exception('Failed to delete file "%s": %s', file_obj.filename, exc)
        db.session.rollback()
        return jsonify({'error': 'Failed to delete file'}), 500


@bp.route('/files/download/<int:file_id>', methods=['GET'])
@login_required
def download_file(file_id):
    permissions = _build_permission_cache()
    file = File.query.get_or_404(file_id)

    if not _has_access(file, permissions):
        return jsonify({'error': 'Permission denied'}), 403

    if file.is_folder:
        folder_path = _resolve_disk_path(file.owner_id, file)
        if not os.path.exists(folder_path):
            return jsonify({'error': 'Folder not found'}), 404

        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        temp_zip_path = temp_zip.name
        temp_zip.close()

        with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(folder_path):
                rel_root = os.path.relpath(root, folder_path)
                if not files and not dirs:
                    folder_entry = file.filename if rel_root == '.' else os.path.join(file.filename, rel_root)
                    zipf.writestr(folder_entry.rstrip('/') + '/', '')
                for fname in files:
                    abs_path = os.path.join(root, fname)
                    rel_path = os.path.relpath(abs_path, folder_path)
                    arcname = os.path.join(file.filename, rel_path)
                    zipf.write(abs_path, arcname=arcname)

        @after_this_request
        def cleanup(response):
            try:
                os.remove(temp_zip_path)
            except OSError:
                pass
            return response

        return send_file(
            temp_zip_path,
            as_attachment=True,
            download_name=f"{file.filename}.zip",
            mimetype='application/zip'
        )

    folder_path = _resolve_disk_path(file.owner_id, file.parent)
    return send_from_directory(folder_path, file.filename, as_attachment=True)

@bp.route('/folders', methods=['POST'])
@login_required
def create_folder():
    data = request.get_json()
    folder_name = data.get('folder_name')
    parent_id = data.get('parent_id')
    if parent_id is not None:
        try:
            parent_id = int(parent_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid parent id'}), 400
    permissions = _build_permission_cache()
    parent_folder = None
    owner_id = current_user.id

    if not folder_name:
        return jsonify({'error': 'Folder name is required'}), 400

    if parent_id is not None:
        parent_folder = File.query.get_or_404(parent_id)
        if not parent_folder.is_folder:
            return jsonify({'error': 'Invalid parent folder'}), 400
        if not _has_access(parent_folder, permissions, require_write=True):
            return jsonify({'error': 'Permission denied'}), 403
        owner_id = parent_folder.owner_id

    sanitized_name = _sanitize_folder_name(folder_name)
    if not sanitized_name:
        return jsonify({'error': 'Folder name is invalid'}), 400

    new_folder = File(
        filename=sanitized_name,
        owner_id=owner_id,
        parent_id=parent_id,
        is_folder=True
    )
    db.session.add(new_folder)
    db.session.commit()

    folder_path = _resolve_disk_path(owner_id, parent_folder)
    os.makedirs(os.path.join(folder_path, sanitized_name), exist_ok=True)

    return jsonify(new_folder.to_dict()), 201
