const fileList = document.getElementById("fileList");
const pathDisplay = document.getElementById("pathDisplay");
const currentFolder = document.getElementById("currentFolder");
const backButton = document.getElementById("backButton");
const contextMenu = document.getElementById("contextMenu");
const renameScreen = document.getElementById("renameScreen");
const renameInput = document.getElementById("renameInput");
const newFolderOption = document.getElementById("newFolderOption");
const newFolderDialog =document.getElementById("newFolderDialog");
const newFolderForm =document.getElementById("newFolderForm");
const newFolderInput =document.getElementById("newFolderInput");
const cancelFolderButton =document.getElementById("cancelFolderButton");
const createFolderButton =document.getElementById("createFolderButton");

let fileBeingRenamed = null;
let currentPath = null;
let selectedEntry = null;

function joinRemotePath(parentPath, itemName) {
    if (parentPath === "/") {
        return `/${itemName}`;
    }

    return `${parentPath}/${itemName}`;
};

async function showDirectory(remotePath) {
    currentPath = remotePath;
    pathDisplay.textContent = `Current path: thisPC${currentPath}`;
    // Remove the old folder's buttons before drawing the new ones.
    fileList.replaceChildren();

    try {
        const list = await window.server.listDirectory(currentPath);
        if(list.length === 0) {
            fileList.textContent = "This folder is empty.";
        }
        for (const file of list) {
            const itemButton = document.createElement("button");

            //thank you chatgpt for great emojis will replace with assets later probably
            itemButton.textContent = file.type === "directory" ? `📁 ${file.name}` : `📄 ${file.name}`;
            
            itemButton.classList.add("file-item");
            
            itemButton.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                event.stopPropagation();

                openContextMenu(event.clientX,event.clientY,file );
            });

            itemButton.onclick = () => {
                if (file.type === "directory") {
                    const nextPath = joinRemotePath(currentPath, file.name);

                    showDirectory(nextPath);
                } else {
                    console.log(`File clicked: ${file.name}`);
                }
            };

            fileList.appendChild(itemButton);
        }
    } catch (error) {
        console.error("Could not load directory:", error);
        fileList.textContent = "Could not load this directory.";
    }
}
function openRenameInput(file,clickedButton) {
    const renameScreen = document.getElementById("renameScreen");
    const renameInput = document.getElementById("renameInput");
    const buttonPosition = clickedButton.getBoundingClientRect();

    renameInput.value = file.name;
    renameInput.style.position = "fixed";
    renameInput.style.left = `${buttonPosition.left}px`;
    renameInput.style.top = `${buttonPosition.top}px`;
    renameInput.style.width = `${buttonPosition.width}px`;
    renameInput.style.height = `${buttonPosition.height}px`;

    renameInput.value = "";
    renameInput.placeholder = file.name;
    renameScreen.classList.remove("hidden");
    renameInput.focus();
    renameScreen.onclick = async (event) => {
        if (event.target !== renameScreen) {
            return;
        }

        const newName = renameInput.value.trim();
        renameScreen.classList.add("hidden");

        if (newName === "") {
            return;
        }

        try {
            await window.server.renameEntry(file.path, newName);
            await loadDirectory(currentPath);
        } catch (error) {
            console.error("Failed to rename:", error);
        }
    };
}

function openContextMenu(mouseX, mouseY, entry) {
    const buttonContextMenu =document.querySelectorAll(".buttonContextMenu");
    const clickedButton = event.target.closest(".file-item");
    const pageContextMenu =document.querySelectorAll(".pageContextMenu");

    contextMenu.style.display = "block";
    contextMenu.style.left = `${mouseX}px`;
    contextMenu.style.top = `${mouseY}px`;
    document.addEventListener("click", () => {
        closeContextMenu();
    });
    if (entry === null) {
        pageContextMenu.forEach((button) => {button.classList.remove("hidden")});
        buttonContextMenu.forEach((button) => {button.classList.add("hidden")});
        let isCreatingFolder = false;
        uploadOption.onclick = async () => {
            try {
                const result = await window.server.uploadFiles(currentPath);
                await showDirectory(currentPath)
            } catch (error) {
                    console.error("Error uploading files:", error);
            }
        }
        newFolderOption.addEventListener("click", async () => {
            closeContextMenu()
            newFolderInput.value = "";
            newFolderDialog.showModal();
            newFolderInput.focus();
        });
    

        cancelFolderButton.addEventListener("click", () => {
            newFolderDialog.close();
        });


        newFolderForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const folderName = newFolderInput.value.trim();
                if (folderName === null || folderName.trim() === "") {
                    return;
                }

                try {
                    await window.server.createFolder(currentPath,folderName);
                    await showDirectory(currentPath);
                } catch (error) {
                    console.error("Failed to create folder:", error);
                    window.alert(error.message);
                }
                finally{
                    createFolderButton.disabled = false;
                    newFolderDialog.close();

                }
            });
        } 
        else {
                pageContextMenu.forEach((button) => {button.classList.add("hidden")});
                buttonContextMenu.forEach((button) => {button.classList.remove("hidden")});
                selectedEntry = entry;
                downloadOption.addEventListener("click", async () => {        
                try { 
                    const result = await window.server.downloadWrap(selectedEntry);
                    console.log("Downloaded successfully");
                } catch (error) {
                    console.error("Download failed:", error);
                }
                    closeContextMenu();
                });
                renameOption.addEventListener("click", () => {
                    closeContextMenu()
                    openRenameInput(entry,clickedButton);

        });

        }
    

}

function closeContextMenu() {
    contextMenu.style.display = "none";
    selectedEntry = null;
}
document.addEventListener("contextmenu",(event) => {
    event.preventDefault();
    openContextMenu(event.clientX,event.clientY,null);
});





backButton.onclick = () => {
    if (currentPath === "/") {
        return;
    }

    const parentPath = currentPath.substring(
        0,
        currentPath.lastIndexOf("/")
    ) || "/";

    showDirectory(parentPath);
};



showDirectory("/"); // Start at the root directory