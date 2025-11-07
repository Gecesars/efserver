from collections import defaultdict
from flask import render_template, redirect, url_for, flash, Blueprint, request
from flask_login import login_required
from app.models import User, Role, File, UserFilePermission
from app.forms import UserForm
from app import db

bp = Blueprint('admin', __name__)

from app.decorators import admin_required


def _build_folder_rows():
    folders = File.query.filter_by(is_folder=True).all()
    children = defaultdict(list)

    for folder in folders:
        children[folder.parent_id].append(folder)

    for siblings in children.values():
        siblings.sort(key=lambda f: f.filename.lower())

    ordered = []

    def traverse(parent_id=None, depth=0):
        for folder in children.get(parent_id, []):
            ordered.append({
                'folder': folder,
                'depth': depth,
                'path': folder.get_full_path()
            })
            traverse(folder.id, depth + 1)

    traverse()
    return ordered


@bp.route('/')
@login_required
@admin_required
def admin_dashboard():
    return render_template('admin/dashboard.html')

@bp.route('/users')
@login_required
@admin_required
def list_users():
    users = User.query.all()
    return render_template('admin/users.html', users=users)

@bp.route('/users/add', methods=['GET', 'POST'])
@login_required
@admin_required
def add_user():
    form = UserForm()
    if form.validate_on_submit():
        user = User(username=form.username.data, role_id=form.role.data)
        db.session.add(user)
        db.session.commit()
        flash('User added successfully.')
        return redirect(url_for('admin.list_users'))
    return render_template('admin/user.html', form=form, title='Add User')

@bp.route('/users/edit/<int:id>', methods=['GET', 'POST'])
@login_required
@admin_required
def edit_user(id):
    user = User.query.get_or_404(id)
    form = UserForm(obj=user)
    if form.validate_on_submit():
        user.username = form.username.data
        user.role_id = form.role.data
        db.session.commit()
        flash('User updated successfully.')
        return redirect(url_for('admin.list_users'))
    return render_template('admin/user.html', form=form, user=user, title='Edit User')


@bp.route('/users/manage_permissions/<int:id>', methods=['GET', 'POST'])
@login_required
@admin_required
def manage_user_permissions(id):
    user = User.query.get_or_404(id)
    folder_rows = _build_folder_rows()

    if request.method == 'POST':
        UserFilePermission.query.filter_by(user_id=user.id).delete()

        for entry in folder_rows:
            folder = entry['folder']
            read_permission = request.form.get(f'read_{folder.id}')
            write_permission = request.form.get(f'write_{folder.id}')

            if read_permission or write_permission:
                permission = UserFilePermission(
                    user_id=user.id,
                    file_id=folder.id,
                    can_read=read_permission is not None,
                    can_write=write_permission is not None
                )
                db.session.add(permission)

        db.session.commit()
        flash('Permissions updated successfully.')
        return redirect(url_for('admin.manage_user_permissions', id=user.id))

    user_permissions = {p.file_id: p for p in user.permissions.all()}
    return render_template(
        'admin/manage_permissions.html',
        user=user,
        folder_rows=folder_rows,
        user_permissions=user_permissions,
        title='Manage Permissions'
    )

@bp.route('/users/delete/<int:id>', methods=['POST'])
@login_required
@admin_required
def delete_user(id):
    user = User.query.get_or_404(id)
    db.session.delete(user)
    db.session.commit()
    flash('User deleted successfully.')
    return redirect(url_for('admin.list_users'))
