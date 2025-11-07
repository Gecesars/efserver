from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from app.models import File, UserFilePermission
from app import db
import os

bp = Blueprint('files', __name__)

@bp.route('/files', methods=['GET'])
@login_required
def list_files():
    parent_id = request.args.get('parent_id', default=None, type=int)
    sort_by = request.args.get('sort_by', default='name', type=str)

    # Query for files and folders owned by the user
    owned_files = File.query.filter_by(owner_id=current_user.id, parent_id=parent_id)

    # Query for files and folders shared with the user
    shared_files = db.session.query(File).join(UserFilePermission).filter(
        UserFilePermission.user_id == current_user.id,
        UserFilePermission.can_read == True,
        File.parent_id == parent_id
    )

    # Combine the queries
    query = owned_files.union(shared_files)

    if sort_by == 'date':
        query = query.order_by(File.is_folder.desc(), File.created_at.desc())
    else:
        query = query.order_by(File.is_folder.desc(), File.filename.asc())

    items = [item.to_dict() for item in query.all()]
    
    return jsonify(items)

@bp.route('/files/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    parent_id = request.form.get('parent_id', type=int)
    relative_path = request.form.get('relative_path')

    if file:
        filename = secure_filename(file.filename)
        
        user_upload_path = os.path.join(current_app.config['UPLOAD_FOLDER'], f'user_{current_user.id}')

        if relative_path:
            path_parts = relative_path.split('/')
            if len(path_parts) > 1:
                folder_path = os.path.join(*path_parts[:-1])
                user_upload_path = os.path.join(user_upload_path, folder_path)
                
                # Create folders in DB
                current_parent_id = parent_id
                for part in path_parts[:-1]:
                    folder = File.query.filter_by(owner_id=current_user.id, parent_id=current_parent_id, filename=part, is_folder=True).first()
                    if not folder:
                        new_folder = File(
                            filename=part,
                            owner_id=current_user.id,
                            parent_id=current_parent_id,
                            is_folder=True
                        )
                        db.session.add(new_folder)
                        db.session.commit()
                        current_parent_id = new_folder.id
                    else:
                        current_parent_id = folder.id
                parent_id = current_parent_id

        os.makedirs(user_upload_path, exist_ok=True)
        file_path = os.path.join(user_upload_path, filename)
        file.save(file_path)

        # Create new file record in DB
        new_file = File(
            filename=filename, 
            owner_id=current_user.id, 
            parent_id=parent_id,
            is_folder=False
        )
        db.session.add(new_file)
        db.session.commit()

        return jsonify(new_file.to_dict()), 201
    
    return jsonify({'error': 'File upload failed'}), 500

from flask import Blueprint, jsonify, request, current_app, send_from_directory

@bp.route('/files/download/<int:file_id>', methods=['GET'])
@login_required
def download_file(file_id):
    file = File.query.get_or_404(file_id)

    # Check if the user owns the file
    if file.owner_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403

    # Construct the path to the file
    user_upload_path = os.path.join(current_app.config['UPLOAD_FOLDER'], f'user_{current_user.id}')
    
    # Handle nested folders
    if file.parent:
        path_parts = []
        parent = file.parent
        while parent:
            path_parts.append(parent.filename)
            parent = parent.parent
        
        user_upload_path = os.path.join(user_upload_path, *reversed(path_parts))

    return send_from_directory(user_upload_path, file.filename, as_attachment=True)

@bp.route('/folders', methods=['POST'])
@login_required
def create_folder():
    data = request.get_json()
    folder_name = data.get('folder_name')
    parent_id = data.get('parent_id')

    if not folder_name:
        return jsonify({'error': 'Folder name is required'}), 400

    new_folder = File(
        filename=folder_name,
        owner_id=current_user.id,
        parent_id=parent_id,
        is_folder=True
    )
    db.session.add(new_folder)
    db.session.commit()

    return jsonify(new_folder.to_dict()), 201
